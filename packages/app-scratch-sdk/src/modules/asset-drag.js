import { isEqualWith, isObject } from "lodash-es";

const ASSET_DRAG = "assetDrag";

export default {
  /*------------------------------------*\
    Author side
  \*------------------------------------*/

  initialAppState: reduxState => ({
    [ASSET_DRAG]: reduxState.scratchGui.assetDrag,
  }),

  compareReduxState: (prevReduxState, currReduxState, appState) => {
    const prevAssetDrag = prevReduxState.scratchGui.assetDrag;
    const currAssetDrag = currReduxState.scratchGui.assetDrag;
    if (prevAssetDrag !== currAssetDrag && !isEqualAssetDrag(appState[ASSET_DRAG], currAssetDrag)) {
      return {
        [ASSET_DRAG]: currAssetDrag,
      };
    }
  },

  /*------------------------------------*\
    Audience side
  \*------------------------------------*/

  initialReduxState: appState => [
    {
      path: ["scratchGui", "assetDrag"],
      value: appState[ASSET_DRAG],
    },
  ],

  compareAppState: (diff, appState, reduxState) => {
    if (diff[ASSET_DRAG]) {
      const { assetDrag } = reduxState.scratchGui;
      if (!isEqualAssetDrag(appState[ASSET_DRAG], assetDrag)) {
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
  },
};

function isEqualAssetDrag(a, b) {
  return a && b && (a === b || isEqualWith(a, b, compareAssetDrag));
}

function compareAssetDrag(objValue, othValue) {
  return isObject(objValue) || objValue === othValue;
}
