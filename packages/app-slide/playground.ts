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
  definePPT("星空", "9abed6605bbc11ec88a83b917638a00c"),
  definePPT("Flat (English)", "5f10c72cd0eb446282b99c3bab14ee93"),
  definePPT("Flat (中文)", "7904da9ed7424ede961e9873fac60c64"),
];

export default options;
