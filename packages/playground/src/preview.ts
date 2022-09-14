/* eslint-disable @typescript-eslint/no-explicit-any */
import { previewSlide, DefaultUrl } from "../../app-slide/src/index";

const $root = document.querySelector("#app") as HTMLDivElement;

function main() {
  const query = new URLSearchParams(location.search);
  const taskId = query.get("taskId");
  if (!taskId) {
    $root.textContent = "Missing taskId.";
    return;
  }
  let url = query.get("url");
  if (!url) {
    url = DefaultUrl;
  }

  const viewer = previewSlide({ container: $root, taskId, url });
  (window as any).slideViewer = viewer;
}

main();
