import { element, add_class, append, attr } from "./internal";
import { createCube, createSymbols } from "./svg";

export function createUI(state: number[]) {
  const $container = add_class(element("div"), "container");

  const $symbols = createSymbols();
  append($container, $symbols);

  const { $cube, $faces } = createCube(state);
  append($container, $cube);

  const class_reset = "netless-app-dice-reset";
  const class_activate = "netless-app-dice-activate";

  function reset() {
    $cube.classList.remove(class_activate);
    $cube.classList.add(class_reset);
  }

  function activate() {
    $cube.classList.remove(class_reset);
    $cube.classList.add(class_activate);
  }

  function set_face(index: number, id: number) {
    const $face = $faces[index];
    const $use = $face.querySelector("svg use") as SVGUseElement;
    attr($use, "href", `#dice-face-${id}`);
  }

  let currentColor = "";
  function set_color(color: string) {
    if (currentColor !== color) {
      currentColor = color;
      $faces.forEach($face => {
        $face.style.backgroundColor = color;
      });
    }
  }

  return { $container, $symbols, $cube, $faces, reset, activate, set_face, set_color };
}
