import type { NetlessApp } from "@netless/window-manager";
import App from "./app.svelte";
import styles from "./style.css?inline";

export interface Attributes {
  list: string[];
}

/**
 * @example
 * WindowManager.register({ kind: "TodoApp", src: TodoApp })
 *
 * manager.addApp({
 *   kind: "TodoApp",
 *   attributes: {
 *     list: ["hello, world!"]
 *   }
 * })
 */
const TodoApp: NetlessApp<Attributes> = {
  kind: "TodoApp",
  setup(context) {
    let box = context.getBox();
    box.mountStyles(styles);

    let list = context.getAttributes()?.list || [];

    let app = new App({
      target: box.$content!,
      props: { list },
    });

    app.$on("update", ({ detail: newList }) => {
      if (list !== newList) {
        context.updateAttributes(["list"], newList);
      }
    });

    context.emitter.on("attributesUpdate", attrs => {
      if (attrs?.list) {
        list = [...attrs.list];
        app.$set({ list });
      }
    });
  },
};

export default TodoApp;
