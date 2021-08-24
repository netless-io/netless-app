import { NetlessApp } from "@netless/window-manager";

const HelloWorld: NetlessApp = {
  kind: "HelloWorld",
  setup(context) {
    let h1 = document.createElement("h1");
    h1.textContent = "Hello world!";
    context.getBox().mountContent(h1);
  },
};

export default HelloWorld;
