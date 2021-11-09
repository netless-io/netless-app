import type { NetlessApp } from "@netless/window-manager";

import React from "react";
import ReactDOM from "react-dom";

import App from "./App";
import logger from "./logger";
import { createContent } from "./helpers";

export interface Attributes {}

const BlinkMind: NetlessApp<Attributes> = {
  kind: "BlinkMind",
  setup(context) {
    const box = context.getBox();

    const content = createContent();

    box.mountContent(content);

    ReactDOM.render(<App />, content);

    context.emitter.on("destroy", () => {
      logger.log("destroy");
      ReactDOM.unmountComponentAtNode(content);
    });
  },
};

export default BlinkMind;
