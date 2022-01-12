import { plainProps } from "../utils/plain-props";

const helper = plainProps(
  {
    projectTitle: ["projectTitle"],
    colorPickerActive: ["colorPicker", "active"],
    activeEditorTab: ["editorTab", "activeTabIndex"],
    menus: ["menus"],
    micIndicator: ["micIndicator"],
    modals: ["modals"],
    mode: ["mode"],
    projectId: ["projectState", "projectId"],
    stageSize: ["stageSize", "stageSize"],
  },
  ["scratchGui"]
);

export default helper;
