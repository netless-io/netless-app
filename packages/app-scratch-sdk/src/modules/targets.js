import { primitiveProps } from "../utils/primitive-props";

// const EDITING_TARGET = "targets.editingTarget";
const HIGHLIGHTED_TARGET_ID = "targets.highlightedTargetId";
const HIGHLIGHTED_TARGET_TIME = "targets.highlightedTargetTime";

export default primitiveProps(
  {
    // [EDITING_TARGET]: ["editingTarget"],
    [HIGHLIGHTED_TARGET_ID]: ["highlightedTargetId"],
    [HIGHLIGHTED_TARGET_TIME]: ["highlightedTargetTime"],
  },
  ["scratchGui", "targets"]
);
