import type { PlaygroundConfig, PlaygroundConfigs } from "../playground/typings";
import type { Attributes } from "./src";
import { addHooks } from "./src";

function definePPT(
  title: string,
  taskId: string,
  scenePath?: string,
  url?: string
): PlaygroundConfig<Attributes> {
  return {
    kind: "Slide",
    src: () => import("./src"),
    options: { title, scenePath: scenePath || `/Slide/${taskId}` },
    attributes: { taskId, url },
    addHooks,
  };
}

const options: PlaygroundConfigs<Attributes> = [
  definePPT("星空1", "9abed6605bbc11ec88a83b917638a00c", "/Slide/1"),
  definePPT("星空2", "9abed6605bbc11ec88a83b917638a00c", "/Slide/2"),
  definePPT("星空3", "9abed6605bbc11ec88a83b917638a00c", "/Slide/3"),
];

export default options;
