import { size } from "lodash-es";
import { FormattedMessage } from "react-intl";
import { mergeArray, isEqualArrayWithKey } from "../utils/array";
import { serialize, deserialize } from "../utils/react-serialize";

const ALERTS_VISIBLE = "alerts.visible";
const ALERTS_ALERTS_LIST = "alerts.alertsList";

export default {
  /*------------------------------------*\
    Author side
  \*------------------------------------*/

  initialAppState: reduxState => ({
    [ALERTS_VISIBLE]: reduxState.scratchGui.alerts.visible,
    [ALERTS_ALERTS_LIST]: inflateAlertsList(reduxState.scratchGui.alerts.alertsList),
  }),

  compareReduxState: (prevReduxState, currReduxState, appState) => {
    const prevAlerts = prevReduxState.scratchGui.alerts;
    const currAlerts = currReduxState.scratchGui.alerts;
    if (prevAlerts !== currAlerts) {
      const newState = {};
      if (
        prevAlerts.visible !== currAlerts.visible &&
        appState[ALERTS_VISIBLE] !== currAlerts.visible
      ) {
        newState[ALERTS_VISIBLE] = currAlerts.visible;
      }
      if (
        prevAlerts.alertsList !== currAlerts.alertsList &&
        !isEqualArrayWithKey(appState[ALERTS_ALERTS_LIST], currAlerts.alertsList, "alertId")
      ) {
        newState[ALERTS_ALERTS_LIST] = inflateAlertsList(currAlerts.alertsList);
      }
      if (size(newState) > 0) {
        return newState;
      }
    }
  },

  /*------------------------------------*\
    Audience side
  \*------------------------------------*/

  initialReduxState: appState => [
    {
      path: ["scratchGui", "alerts"],
      value: {
        visible: appState[ALERTS_VISIBLE],
        alertsList: deflateAlertsList(appState[ALERTS_ALERTS_LIST]),
      },
    },
  ],

  compareAppState: (diff, appState, reduxState) => {
    if (diff[ALERTS_VISIBLE] || diff[ALERTS_ALERTS_LIST]) {
      const { alerts } = reduxState.scratchGui;
      const newState = {};
      if (diff[ALERTS_VISIBLE] && appState[ALERTS_VISIBLE] !== alerts.visible) {
        newState.visible = appState[ALERTS_VISIBLE];
      }
      if (
        diff[ALERTS_ALERTS_LIST] &&
        !isEqualArrayWithKey(appState[ALERTS_ALERTS_LIST], alerts.alertsList, "alertId")
      ) {
        newState.alertsList = mergeArray(
          alerts.alertsList,
          deflateAlertsList(appState[ALERTS_ALERTS_LIST]),
          "alertId"
        );
      }
      if (size(newState) > 0) {
        return [
          {
            path: ["scratchGui", "alerts"],
            value: {
              ...alerts,
              ...newState,
            },
          },
        ];
      }
    }
  },
};

/*------------------------------------*\
  Helpers
\*------------------------------------*/

function inflateAlertsListItem(item) {
  if (item.content) {
    return {
      ...item,
      content: serialize(item.content),
    };
  }
  return item;
}

function inflateAlertsList(alertsList) {
  if (alertsList && alertsList.length > 0) {
    return alertsList.map(inflateAlertsListItem);
  }
  return Array.isArray(alertsList) ? alertsList : [];
}

function deflateAlertsListItem(item) {
  if (item.content) {
    return {
      ...item,
      content: deserialize(item.content, { components: { FormattedMessage } }),
    };
  }
  return item;
}

function deflateAlertsList(alertsList) {
  if (alertsList && alertsList.length > 0) {
    return alertsList.map(deflateAlertsListItem);
  }
  return Array.isArray(alertsList) ? alertsList : [];
}
