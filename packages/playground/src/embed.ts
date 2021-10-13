/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { createEmbeddedApp } from "@netless/app-embedded-page-sdk";

const $ = <T = HTMLElement>(sel: string) => document.querySelector(sel) as unknown as T;

async function main(): Promise<void> {
  const app = await createEmbeddedApp();

  // set key value to app.state only if the key does not exists
  app.ensureState({ count: 0 });

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
    const { value } = $<HTMLInputElement>("#message-payload");
    $<HTMLTextAreaElement>("#message-recv").value += "> " + value + "\n";
    app.sendMessage(value);
  });

  // ------ Listen Message ------
  const receiveMessage = (payload: string) => {
    console.log("receiveMessage");
    $<HTMLTextAreaElement>("#message-recv").value += "< " + payload + "\n";
  };
  app.onMessage.addListener(receiveMessage);

  // ------ Set Page (available when "scenePath" exists) ------
  $("#page-set").addEventListener("click", () => {
    app.setPage($<HTMLInputElement>("#page").value);
  });

  // ------ Listen Page Change ------
  const refreshPage = () => {
    console.log("refreshPage");
    $<HTMLInputElement>("#page").value = String(app.page);
  };
  app.onPageChanged.addListener(refreshPage);

  // ------ Listen Writable Change ------
  const refreshWritable = () => {
    $("#writable").textContent = String(app.isWritable);
  };
  app.onWritableChanged.addListener(refreshWritable);

  // ------ Refresh App ------
  refreshCount();
  refreshPage();
  refreshWritable();

  // for debugging
  (window as any).embeddedApp = app;
}

main();
