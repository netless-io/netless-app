import type { NetlessApp } from "@netless/window-manager";

import { color_to_string, noop } from "./internal";
import { createUI } from "./player";
import styles from "./style.scss?inline";

const Dice: NetlessApp = {
  kind: "Dice",
  setup(context) {
    const disposers: Set<() => void> = new Set();

    const faces$$ = context.createStorage<{ value?: number[]; color?: string }>("faces");

    const $ui = createUI(faces$$.state.value || [1, 2, 3, 4, 5, 6]);
    $ui.$cube.onclick = function roll() {
      if ($ui.$cube.classList.contains("netless-app-dice-activate")) return;
      const color = context.currentMember?.memberState.strokeColor;
      faces$$.setState({
        value: shuffle([1, 2, 3, 4, 5, 6]),
        color: color ? color_to_string(color) : "",
      });
    };

    let cancel = noop;
    function refreshCube() {
      cancel();
      disposers.delete(cancel);
      $ui.activate();
      $ui.set_color(faces$$.state.color || "");

      const timer_update_faces = setTimeout(() => {
        const faces = faces$$.state.value;
        if (!faces) return;
        faces.forEach((id, index) => $ui.set_face(index, id));
      }, 1000);

      const timer_reset = setTimeout($ui.reset, 3010);

      cancel = () => {
        clearTimeout(timer_reset);
        clearTimeout(timer_update_faces);
        $ui.reset();
      };

      disposers.add(cancel);
    }

    disposers.add(faces$$.on("stateChanged", refreshCube));

    context.box.mountStyles(styles);
    context.box.mountContent($ui.$container);

    context.emitter.on("destroy", () => {
      disposers.forEach(dispose => dispose());
    });
  },
};

export default Dice;

function shuffle(array: number[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
