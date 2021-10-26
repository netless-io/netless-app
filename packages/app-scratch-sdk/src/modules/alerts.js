import { mergeArray } from "../helpers";
import { serialize, deserialize } from "../react-serialize";
import { FormattedMessage } from "react-intl";

const ALERTS_VISIBLE = "alerts.visible";
const ALERTS_ALERTS_LIST = "alerts.alertsList";

/*------------------------------------*\
  Author side
\*------------------------------------*/

export const initialAppState = reduxState => ({
  [ALERTS_VISIBLE]: reduxState.scratchGui.alerts.visible,
  [ALERTS_ALERTS_LIST]: inflateAlertsList(reduxState.scratchGui.alerts.alertsList),
});

export const compareReduxState = (prevReduxState, currReduxState) => {
  const prevAlerts = prevReduxState.scratchGui.alerts;
  const currAlerts = currReduxState.scratchGui.alerts;
  if (prevAlerts !== currAlerts) {
    const newState = {};
    if (prevAlerts.visible !== currAlerts.visible) {
      newState[ALERTS_VISIBLE] = currAlerts.visible;
    }
    if (prevAlerts.alertsList !== currAlerts.alertsList) {
      newState[ALERTS_ALERTS_LIST] = inflateAlertsList(currAlerts.alertsList);
    }
    return newState;
  }
};

/*------------------------------------*\
  Audience side
\*------------------------------------*/

export const initialReduxState = appState => [
  {
    path: ["scratchGui", "alerts"],
    value: {
      visible: appState[ALERTS_VISIBLE],
      alertsList: deflateAlertsList(appState[ALERTS_ALERTS_LIST]),
    },
  },
];

export const compareAppState = (diff, appState, reduxState) => {
  if (diff[ALERTS_VISIBLE] || diff[ALERTS_ALERTS_LIST]) {
    const { alerts } = reduxState.scratchGui;
    const newState = {
      visible: alerts.visible,
      alertsList: alerts.alertsList,
    };
    if (diff[ALERTS_VISIBLE]) {
      newState.visible = appState[ALERTS_VISIBLE];
    }
    if (diff[ALERTS_ALERTS_LIST]) {
      newState.alertsList = mergeArray(
        alerts.alertsList,
        deflateAlertsList(appState[ALERTS_ALERTS_LIST]),
        "alertId"
      );
    }
    return [
      {
        path: ["scratchGui", "alerts"],
        value: newState,
      },
    ];
  }
};

/*------------------------------------*\
  Helpers
\*------------------------------------*/

function inflateAlertsList(alertsList) {
  if (!alertsList || alertsList.length <= 0) {
    return alertsList;
  }
  return alertsList.map(item => {
    if (item.content) {
      return {
        ...item,
        content: serialize(item.content),
      };
    }
    return item;
  });
}

function deflateAlertsList(alertsList) {
  if (!alertsList || alertsList.length <= 0) {
    return alertsList;
  }
  return alertsList.map(item => {
    if (item.content) {
      return {
        ...item,
        content: deserialize(item.content, { components: { FormattedMessage } }),
      };
    }
    return item;
  });
}
