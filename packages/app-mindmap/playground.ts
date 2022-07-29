import type { PlaygroundConfigs } from "../playground/typings";
import type { NetlessAppMindMapAttributes } from "./src";

const HarryPotterContents: NetlessAppMindMapAttributes["root"] = {
  label: "Harry Potter",
  children: [
    {
      label: "Philosopher's Stone",
      children: [
        { label: "The Boy Who Lived" },
        { label: "The Vanishing Glass" },
        { label: "The Letters From No One" },
        { label: "..." },
      ],
    },
    {
      label: "Chamber of Secrets",
      children: [
        { label: "The Worst Birthday" },
        { label: "Dobby's Warning" },
        { label: "The Burrow" },
        { label: "..." },
      ],
    },
    { label: "Prisoner of Azkaban" },
    { label: "The Goblet of Fire" },
    { label: "The Order of the Phoenix" },
    { label: "Half-Blood Prince" },
    { label: "The Deathly Hallows" },
  ],
};

const options: PlaygroundConfigs<NetlessAppMindMapAttributes> = [
  {
    kind: "MindMap",
    src: () => import("./src"),
    options: {
      title: HarryPotterContents.label,
    },
    attributes: {
      root: HarryPotterContents,
    },
  },
  {
    kind: "MindMap",
    src: () => import("./src"),
    options: {
      title: "Empty",
    },
  },
];

export default options;
