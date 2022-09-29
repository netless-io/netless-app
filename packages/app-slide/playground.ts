import type { PlaygroundConfig, PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import { addHooks } from "./src/utils/freezer";

function definePPT(
  title: string,
  taskId: string,
  preview?: boolean,
  url?: string
): PlaygroundConfig<Attributes> {
  return {
    kind: "Slide",
    src: () => import("./src"),
    options: { title, scenePath: `/Slide/${taskId}/${title}` },
    attributes: { taskId, url, preview },
    addHooks,
  };
}

const options: PlaygroundConfigs<Attributes> = [
  definePPT("星空1", "9abed6605bbc11ec88a83b917638a00c", true),
  definePPT("星空2", "9abed6605bbc11ec88a83b917638a00c", false),
  definePPT("星空3", "9abed6605bbc11ec88a83b917638a00c"),
];

export default options;
