/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

const app = createEmbeddedApp({ count: 0 });
(window as any).app = app;

const $: <K extends string>(
  sel: K
) => K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement = sel =>
  document.querySelector(sel)!;

// ------ Listen State Change ------
const refreshCount = () => {
  console.log("refreshCount");
  $("#count").textContent = String(app.state.count);
};
app.onStateChanged.addListener(refreshCount);

// ------ Publish State Change, it will trigger onStateChanged on itself ------
$("#count").addEventListener("click", e => {
  const nextCount = (e as MouseEvent).shiftKey ? app.state.count - 1 : app.state.count + 1;
  app.setState({ count: nextCount });
});

// ------ Broadcast Message, it will NOT trigger onMessage on itself ------
$("#message-send").addEventListener("click", () => {
  const { value } = $("#message-payload") as HTMLInputElement;
  ($("#message-recv") as HTMLTextAreaElement).value += "> " + value + "\n";
  app.sendMessage(value);
});

// ------ Listen Message ------
const receiveMessage = (payload: string) => {
  console.log("receiveMessage");
  ($("#message-recv") as HTMLTextAreaElement).value += "< " + payload + "\n";
};
app.onMessage.addListener(receiveMessage);

// ------ Set Page (available when "scenePath" exists) ------
$("#page-set").addEventListener("click", () => {
  app.setPage(($("#page") as HTMLInputElement).value);
});

// ------ Listen Page Change ------
const refreshPage = () => {
  console.log("refreshPage");
  ($("#page") as HTMLInputElement).value = String(app.page);
};
app.onPageChanged.addListener(refreshPage);

// ------ Listen Writable Change ------
const refreshWritable = () => {
  $("#writable").textContent = String(app.isWritable);
};
app.onWritableChanged.addListener(refreshWritable);

// ------ after init, get app.state and app.page ------
app.onInit.addListener(initData => {
  console.log("init", initData);
  refreshCount();
  refreshPage();
  refreshWritable();
});
