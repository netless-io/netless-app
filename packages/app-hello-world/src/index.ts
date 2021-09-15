import type { NetlessApp } from "@netless/window-manager";

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
        padding: .5em;
      }
   `);

    const textarea = document.createElement("textarea");
    textarea.classList.add("netless-app-hello-world");
    textarea.value = context.getAttributes()?.text ?? "Hello world!";
    context.getBox().mountContent(textarea);

    textarea.oninput = () => {
      context.updateAttributes(["text"], textarea.value);
    };

    context.emitter.on("attributesUpdate", attrs => {
      attrs?.text && (textarea.value = attrs.text);
    });

    context.emitter.on("destroy", () => {
      console.log("[HelloWorld]: destroy");
      textarea.remove();
    });
  },
};

export default HelloWorld;
