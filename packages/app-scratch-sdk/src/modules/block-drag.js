const BLOCK_DRAG = "blockDrag";

/*------------------------------------*\
  Author side
\*------------------------------------*/

export const initialAppState = reduxState => ({
  [BLOCK_DRAG]: reduxState.scratchGui.blockDrag,
});

export const compareReduxState = (prevReduxState, currReduxState) => {
  if (prevReduxState.scratchGui.blockDrag !== currReduxState.scratchGui.blockDrag) {
    return initialAppState(currReduxState);
  }
};

/*------------------------------------*\
  Audience side
\*------------------------------------*/

export const initialReduxState = appState => [
  {
    path: ["scratchGui", "blockDrag"],
    value: appState[BLOCK_DRAG],
  },
];

export const compareAppState = (diff, appState, reduxState) => {
  if (diff[BLOCK_DRAG]) {
    if (appState[BLOCK_DRAG] !== reduxState.scratchGui.blockDrag) {
      reduxState.vm.runtime.emitBlockDragUpdate(appState[BLOCK_DRAG]);
    }
  }
};
