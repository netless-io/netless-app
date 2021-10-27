import { isEqualWith, isObject } from "lodash-es";

const ASSET_DRAG = "assetDrag";

/*------------------------------------*\
  Author side
\*------------------------------------*/

export const initialAppState = reduxState => ({
  [ASSET_DRAG]: reduxState.scratchGui.assetDrag,
});

export const compareReduxState = (prevReduxState, currReduxState) => {
  if (prevReduxState.scratchGui.assetDrag !== currReduxState.scratchGui.assetDrag) {
    return initialAppState(currReduxState);
  }
};

/*------------------------------------*\
  Audience side
\*------------------------------------*/

export const initialReduxState = appState => [
  {
    path: ["scratchGui", "assetDrag"],
    value: appState[ASSET_DRAG],
  },
];

export const compareAppState = (diff, appState, reduxState) => {
  if (diff[ASSET_DRAG]) {
    const { assetDrag } = reduxState.scratchGui;
    if (
      appState[ASSET_DRAG] !== assetDrag &&
      !isEqualWith(appState[ASSET_DRAG], assetDrag, compareAssetDrag)
    ) {
      return [
        {
          path: ["scratchGui", "assetDrag"],
          value: isObject(assetDrag.dragPayload)
            ? { ...assetDrag, ...appState[ASSET_DRAG] }
            : appState[ASSET_DRAG],
        },
      ];
    }
  }
};

function compareAssetDrag(objValue, othValue) {
  return isObject(objValue) || objValue === othValue;
}
