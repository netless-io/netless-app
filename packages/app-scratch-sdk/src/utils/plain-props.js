import { mapValues, get, transform, size, isEqual } from "lodash-es";

/**
 * Helper for plain object and primitive properties.
 *
 * @param {Record<string, Array<string>>} appReduxDict
 * @param {Array<string>=} reduxScopePath
 * @returns
 */
export const plainProps = (appReduxDict, reduxScopePath) => {
  return {
    /*------------------------------------*\
      Author side
    \*------------------------------------*/

    initialAppState: reduxState => {
      const reduxScope = reduxScopePath ? get(reduxState, reduxScopePath) : reduxState;
      return mapValues(appReduxDict, reduxPath => get(reduxScope, reduxPath));
    },

    compareReduxState: (prevReduxState, currReduxState, appState) => {
      const currReduxScope = reduxScopePath ? get(currReduxState, reduxScopePath) : currReduxState;
      const prevReduxScope = reduxScopePath ? get(prevReduxState, reduxScopePath) : prevReduxState;

      if (prevReduxScope !== currReduxScope) {
        const result = transform(
          appReduxDict,
          (newAppState, reduxPath, appKey) => {
            const prevValue = get(prevReduxScope, reduxPath);
            const currValue = get(currReduxScope, reduxPath);
            if (prevValue !== currValue && !isEqual(appState[appKey], currValue)) {
              newAppState[appKey] = currValue;
            }
          },
          {}
        );
        if (size(result) > 0) {
          return result;
        }
      }
    },

    /*------------------------------------*\
      Audience side
    \*------------------------------------*/

    initialReduxState: appState =>
      transform(
        appReduxDict,
        (results, reduxPath, appKey) => {
          results.push({
            path: reduxScopePath ? [...reduxScopePath, ...reduxPath] : reduxPath,
            value: appState[appKey],
          });
        },
        []
      ),

    compareAppState: (diff, appState, reduxState) => {
      const results = transform(
        appReduxDict,
        (results, reduxPath, appKey) => {
          if (diff[appKey]) {
            const value = appState[appKey];
            const path = reduxScopePath ? [...reduxScopePath, ...reduxPath] : reduxPath;
            if (!isEqual(value, get(reduxState, path))) {
              results.push({ path, value: value });
            }
          }
        },
        []
      );
      if (results.length > 0) {
        return results;
      }
    },
  };
};
