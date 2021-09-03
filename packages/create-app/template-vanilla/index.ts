import type { NetlessApp } from "@netless/window-manager";

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
    let list = context.getAttributes()?.list || [];

    const h = document.createElement.bind(document);
    const content = h("div");
    content.dataset.kind = "todo-app";
    const ul = h("ul");
    const input = h("input");

    const dispatch = (newList: string[]) => {
      context.updateAttributes(["list"], newList);
    };
    context.emitter.on("attributesUpdate", attrs => {
      if (attrs?.list) {
        list = attrs.list;
        while (ul.firstChild) {
          ul.removeChild(ul.firstChild);
        }
        list.forEach((item, index) => {
          const li = h("li");
          li.textContent = item;
          const button = h("button");
          button.textContent = "❌";
          button.onclick = () => {
            dispatch([...list.slice(0, index), ...list.slice(index + 1)]);
          };
          li.appendChild(button);
          ul.append(li);
        });
      }
    });

    input.onkeydown = ev => {
      if (ev.key === "Enter") {
        ev.stopPropagation();
        ev.preventDefault();
        dispatch([...list, input.value]);
        input.value = "";
      }
    };

    content.append(input);
    content.append(ul);

    const box = context.getBox();
    box.mountStyles(`
      [data-kind="todo-app"] {
        width: 100%; height: 100%; overflow: hidden;
        display: flex; flex-flow: column nowrap;
      }
      [data-kind="todo-app"] input {
        display: block; width: 100%;
      }
    `);
    box.mountContent(content);
  },
};

export default TodoApp;
