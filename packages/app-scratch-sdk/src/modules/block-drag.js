import { primitiveProps } from "../utils/primitive-props";

const BLOCK_DRAG = "blockDrag";

const helper = primitiveProps({ [BLOCK_DRAG]: ["scratchGui", "blockDrag"] });

helper.compareAppState = (diff, appState, reduxState) => {
  if (diff[BLOCK_DRAG] && appState[BLOCK_DRAG] !== reduxState.scratchGui.blockDrag) {
    reduxState.scratchGui.vm.runtime.emitBlockDragUpdate(appState[BLOCK_DRAG]);
  }
};

export default helper;
