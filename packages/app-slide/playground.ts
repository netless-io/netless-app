import type { PlaygroundConfig, PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import { addHooks } from "./src/utils/freezer";

function definePPT(title: string, taskId: string, url?: string): PlaygroundConfig<Attributes> {
  return {
    kind: "Slide",
    src: () => import("./src"),
    options: { title, scenePath: `/Slide/${taskId}` },
    attributes: { taskId, url },
    addHooks,
  };
}

const options: PlaygroundConfigs<Attributes> = [
  definePPT("星空", "9abed6605bbc11ec88a83b917638a00c"),
];

export default options;
