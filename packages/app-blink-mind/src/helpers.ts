import { createKey, Model } from "@blink-mind/core";

export function createModel() {
  const rootKey = createKey();
  return Model.create({
    rootTopicKey: rootKey,
    topics: [
      {
        key: rootKey,
        blocks: [{ type: "CONTENT", data: "MainTopic" }],
      },
    ],
  });
}

export function createContent() {
  const content = document.createElement("div");
  Object.assign(content.style, {
    width: "100%",
    height: "100%",
  });
  return content;
}
