import { NetlessApp } from "@netless/window-manager";

const HelloWorld: NetlessApp<{ text: string }> = {
  kind: "HelloWorld",
  setup(context) {
    context.getBox().mountStyles(`
      .netless-app-hello-world {
        display: block;
        width: 100%; height: 100%;
        overflow: hidden;
        border: 0; resize: none;
        background: #fafbfc;
      }
   `);

    let textarea = document.createElement("textarea");
    textarea.classList.add("netless-app-hello-world");
    textarea.value = context.getAttributes()?.text ?? "Hello world!";
    context.getBox().mountContent(textarea);

    textarea.oninput = () => {
      context.updateAttributes(["text"], textarea.value);
    };

    // @ts-ignore
    context.emitter.on("attributesUpdate", ({ text } = {}) => {
      text !== undefined && (textarea.value = text);
    });

    context.emitter.on("destroy", () => {
      textarea.remove();
    });
  },
};

export default HelloWorld;
