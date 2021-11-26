import { SideEffectManager } from "side-effect-manager";
import { renderAccessControl } from "./access-control";

export class Gui {
  constructor(props) {
    this.sideEffect = new SideEffectManager();
    this.props = props;
  }

  render() {
    this.sideEffect.flushAll();
    this.sideEffect.addDisposer(renderAccessControl(this.props));
  }

  destroy() {
    this.sideEffect.flushAll();
  }
}
