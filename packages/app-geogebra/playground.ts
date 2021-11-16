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
  appOptions: {
    // https://wiki.geogebra.org/en/Reference:GeoGebra_Apps_Embedding#Offline_and_Self-Hosted_Solution
    HTML5Codebase: "https://flat-storage-cn-hz.whiteboard.agora.io/GeoGebra/HTML5/5.0/web3d",
  },
};

export default options;
