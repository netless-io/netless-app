import type { PlaygroundConfig } from "../playground/typings";
import type { Attributes } from "./src";

let uid = sessionStorage.getItem("uid");
if (!uid) {
  uid = Math.random().toString(36).slice(2);
  sessionStorage.setItem("uid", uid);
}

const options: PlaygroundConfig<Attributes> = {
  kind: "GeoGebra",
  src: () => import("./src"),
  options: {
    title: "GeoGebra",
  },
};

export default options;
