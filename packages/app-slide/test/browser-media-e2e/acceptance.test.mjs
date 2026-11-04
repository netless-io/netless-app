import assert from "node:assert/strict";
import { reloadForAcceptance, isExpectedReloadCancellation } from "./acceptance.mjs";

const frame = {};
const url = "http://127.0.0.1:9000/?role=reader";
const request = overrides => ({
  url: () => url,
  failure: () => ({ errorText: "cancelled" }),
  resourceType: () => "document",
  isNavigationRequest: () => true,
  frame: () => frame,
  ...overrides,
});
let duringReload;
const page = { url: () => url, mainFrame: () => frame, reload: () => duringReload() };
assert.equal(isExpectedReloadCancellation(page, request()), false, "ordinary cancellation fails");
duringReload = async () => {
  assert.equal(isExpectedReloadCancellation(page, request()), true);
  for (const overrides of [
    { url: () => url + "&another=document" },
    { failure: () => ({ errorText: "connection refused" }) },
    { failure: () => null },
    { resourceType: () => "fetch" },
    { resourceType: () => "media" },
    { isNavigationRequest: () => false },
    { frame: () => ({}) },
  ]) {
    assert.equal(isExpectedReloadCancellation(page, request(overrides)), false);
  }
  const other = { ...page };
  assert.equal(isExpectedReloadCancellation(other, request()), false, "another page is not exempt");
};
await reloadForAcceptance(page);
assert.equal(isExpectedReloadCancellation(page, request()), false, "reload window must close");
duringReload = async () => {
  throw Error("reload failed");
};
await assert.rejects(reloadForAcceptance(page), /reload failed/);
assert.equal(
  isExpectedReloadCancellation(page, request()),
  false,
  "failed reload must clear scope"
);
console.log(
  "Transport acceptance: scoped reload cancellation accepted; unrelated failures rejected"
);
