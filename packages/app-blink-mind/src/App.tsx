import React from "react";

import { Diagram } from "@blink-mind/renderer-react";
import { createModel } from "./helpers";
import type { Model } from "@blink-mind/core";

type Any = Record<string, unknown>;

export default class App extends React.Component<Any, { model: Model }> {
  constructor(props: Any) {
    super(props);
    this.state = { model: createModel() };
  }
  override render() {
    return <Diagram onChange={this.onChange} model={this.state.model} />;
  }
  onChange = (model: Model, callback?: () => void) => {
    console.log("onchange", model, callback);
  };
}
