import assert from "node:assert/strict";

// Real app-slide, White SDK/Magix, storage and native media. No replacement player.
export async function volumeCoverage({
  prefix,
  pages,
  backend,
  sample,
  converged,
  playing,
  stopped,
  pauseCounts,
  checkpoint,
  result,
  openRole,
}) {
  const [a, b, r] = pages;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const record = (name, details = {}) => checkpoint(prefix + "/volume/" + name, pages, details);
  async function volumes(targets, value, nodes = true) {
    for (const page of targets) {
      await page.waitForFunction(
        ({ value, nodes, backend }) => {
          const s = appMediaGate.sample();
          return (
            s.sharedVolume === value &&
            s.effectiveVolume === value &&
            s.storedVolume === value &&
            (!nodes ||
              (s.mediaVolumes.length > 0 &&
                s.mediaVolumes.every(
                  m =>
                    m.loaded &&
                    m.backend === backend &&
                    m.volume === value &&
                    m.soundVolume === value &&
                    (m.paused || Math.abs(m.nativeVolume - value) < 1e-5)
                )))
          );
        },
        { value, nodes, backend },
        { timeout: 25000 }
      );
    }
  }
  const set = (page, value) => page.evaluate(value => appMediaGate.volume(value), value);
  await volumes(pages, 0.5);
  await record("default-50-percent");
  for (const value of [0.25, 0, 1, 0.5]) {
    await set(a, value);
    await volumes(pages, value);
    assert.ok((await Promise.all(pages.map(sample))).every(s => !s.isPlaying));
    await record("shared-absolute-" + value);
  }
  const readerBefore = await sample(r);
  await set(r, 0.91);
  await sleep(300);
  await volumes(pages, 0.5);
  assert.equal((await sample(r)).stateWrites, readerBefore.stateWrites);
  await record("readonly-cannot-write");

  await r.evaluate(() => appMediaGate.localVolume(0.07));
  assert.equal((await sample(r)).effectiveVolume, 0.07);
  assert.equal((await sample(r)).sharedVolume, 0.5);
  assert.equal((await sample(r)).storedVolume, 0.5);
  await set(b, 0.38);
  await volumes(pages, 0.38);
  await record("local-api-then-shared-override");

  await a.evaluate(() => {
    for (let n = 0; n < 20; n++) appMediaGate.volume(n / 25);
    appMediaGate.volume(0.17);
  });
  await volumes(pages, 0.17);
  await record("burst-final-value");
  // This happens before any real pointer gesture in a blocked-autoplay profile.
  await a.evaluate(() => appMediaGate.play());
  await playing(pages, backend);
  const before = await Promise.all(pages.map(sample));
  await set(a, 0.08);
  await volumes(pages, 0.08);
  const after = await Promise.all(pages.map(sample));
  assert.ok(
    after.every(
      (s, i) => s.isPlaying && !s.audioPaused && s.audioTime >= before[i].audioTime - 0.15
    )
  );
  await record("playing-adjust-keeps-clock", { before, after });
  await set(b, 0);
  await volumes(pages, 0);
  assert.ok((await Promise.all(pages.map(sample))).every(s => s.isPlaying && !s.audioPaused));
  await record("mute-keeps-playing");
  const pauses = await pauseCounts(pages);
  await a.evaluate(() => appMediaGate.pause());
  await stopped(prefix + "/volume/pause-after-mute", pages, backend, pauses);

  for (const index of [1, 2]) {
    if ((await sample(a)).page !== index)
      await a.evaluate(index => appMediaGate.page(index), index);
    await set(a, index === 1 ? 0.23 : 0.42);
    await converged(pages, index);
    await volumes(pages, index === 1 ? 0.23 : 0.42);
    if (index === 2)
      assert.ok((await Promise.all(pages.map(sample))).every(s => s.mediaCount === 2));
    await a.evaluate(() => appMediaGate.prepareVolumeControls());
    const button = a.locator('[data-e2e-volume="active"] button');
    if ((await button.getAttribute("aria-expanded")) === "true") await button.click();
    await button.click();
    const slider = a.locator('[data-e2e-volume="active"] input');
    const box = await slider.boundingBox();
    assert.ok(box);
    await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 40 });
    assert.ok(await slider.isVisible(), "Actual pointer movement must keep the panel open");
    const old = await slider.inputValue(),
      target = index === 1 ? 0.28 : 0.72;
    await a.mouse.move(box.x + box.width * (1 - target), box.y + box.height / 2);
    await a.mouse.down();
    await a.mouse.move(box.x + box.width * target, box.y + box.height / 2, { steps: 10 });
    await a.mouse.up();
    assert.notEqual(await slider.inputValue(), old);
    const value = Number(await slider.inputValue()) / 100;
    await volumes(pages, value);
    await slider.press("Escape");
    assert.equal(await button.getAttribute("aria-expanded"), "false");
    await record("native-slider-page-" + index, { value });
    const rect = await r.evaluate(() => appMediaGate.volumeMediaRect());
    await r.mouse.move(rect.x, rect.y, { steps: 20 });
    await sleep(150);
    assert.equal(
      await r.locator(".ppt-media-volume button:visible").count(),
      0,
      "Read-only room client must keep the existing hidden media-control behavior"
    );
    await record("readonly-ui-page-" + index);
  }

  await a.evaluate(() => appMediaGate.page(3));
  await set(a, 0.29);
  await converged(pages, 3);
  await volumes(pages, 0.29, false);
  await a.evaluate(() => appMediaGate.page(1));
  await set(b, 0.19);
  await converged(pages, 1);
  await volumes(pages, 0.19);
  await record("blank-page-and-delayed-render");

  await r.evaluate(() => appMediaGate.freeze());
  await r.waitForFunction(
    () => appMediaGate.sample().frozen && !appMediaGate.sample().playerExists
  );
  await set(a, 0.14);
  await volumes([a, b], 0.14);
  await r.waitForFunction(() => appMediaGate.sample().storedVolume === 0.14);
  await r.evaluate(() => appMediaGate.unfreeze());
  await converged(pages, 1);
  await volumes(pages, 0.14);
  await record("frozen-reader-restores-latest-volume");

  await set(a, 0.63);
  await volumes(pages, 0.63);
  const late = await openRole("reader-late");
  await volumes(pages, 0.63);
  assert.equal((await sample(late)).writable, false);
  assert.equal((await sample(late)).stateWrites, 0);
  await record("late-reader-restores-volume");
  await late.reload();
  await converged([late], 1);
  await volumes(pages, 0.63);
  await record("reload-restores-volume");

  r.__volumeNetworkFault = true;
  try {
    await r.context().setOffline(true);
    await r.evaluate(() => appMediaGate.reconnect());
    await r.waitForFunction(() => appMediaGate.sample().phase !== "connected", null, {
      timeout: 15000,
    });
    await set(a, 0.46);
    await volumes([a, b, late], 0.46);
    await r.context().setOffline(false);
    await converged([r], 1);
    await volumes(pages, 0.46);
  } finally {
    await r.context().setOffline(false);
    r.__volumeNetworkFault = false;
  }
  await record("offline-reader-restores-missed-volume");

  await a.evaluate(() => appMediaGate.setWritable(false));
  await r.evaluate(() => appMediaGate.setWritable(true));
  await a.waitForFunction(() => !appMediaGate.sample().writable);
  await r.waitForFunction(() => appMediaGate.sample().writable);
  const aBefore = await sample(a);
  await set(a, 0.99);
  await sleep(250);
  await volumes(pages, 0.46);
  assert.equal((await sample(a)).stateWrites, aBefore.stateWrites);
  await set(r, 0.36);
  await volumes(pages, 0.36);
  await record("writable-handoff");
  await a.evaluate(() => appMediaGate.setWritable(true));
  await r.evaluate(() => appMediaGate.setWritable(false));

  await Promise.all([set(a, 0.21), set(b, 0.78)]);
  await a.waitForFunction(() => [0.21, 0.78].includes(appMediaGate.sample().storedVolume));
  await sleep(500);
  const final = (await sample(a)).sharedVolume;
  assert.ok([0.21, 0.78].includes(final));
  await volumes(pages, final);
  await record("concurrent-writers-converge", { final });

  const firstId = (await sample(a)).appId;
  const secondId = await a.evaluate(() => appMediaGate.volumeAddApp());
  for (const page of pages) {
    await page.waitForFunction(id => appMediaGate.volumeAppIds().includes(id), secondId);
    await page.evaluate(id => appMediaGate.volumeSelectApp(id), secondId);
  }
  await converged(pages, 1);
  await volumes(pages, 0.5);
  await set(a, 0.22);
  await volumes(pages, 0.22);
  for (const page of pages) {
    const first = (await page.evaluate(() => appMediaGate.volumeApps())).find(
      app => app.id === firstId
    );
    assert.equal(first.storedVolume, final, "Another PPT with the same resource must be isolated");
    assert.equal(first.sharedVolume, final);
  }
  await record("same-resource-ppt-instances-isolated", { firstId, secondId });
  for (const page of pages) await page.evaluate(id => appMediaGate.volumeSelectApp(id), firstId);
  await a.evaluate(id => appMediaGate.volumeCloseApp(id), secondId);
  await converged(pages, 1);
  await volumes(pages, final);
  await set(a, 0.34);
  await volumes(pages, 0.34);
  await record("close-second-ppt-keeps-first-volume");

  const writes = await Promise.all(pages.map(sample));
  assert.ok(writes.every(s => s.activeRestores === 0 && s.maxRestores <= 1));
  assert.ok(writes.every(s => s.mediaVolumes.every(m => m.paused)));
  assert.deepEqual(result.browserErrors, []);
  await record("final-state-storage-and-native-agree");
}
