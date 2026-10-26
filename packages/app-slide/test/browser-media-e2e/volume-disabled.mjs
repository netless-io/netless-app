import assert from "node:assert/strict";
export async function disabledVolumeCoverage({
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
  const record = (name, details = {}) =>
    checkpoint(prefix + "/volume-disabled/" + name, pages, details);
  const volumes = async (targets, value) => {
    for (const p of targets)
      await p.waitForFunction(
        value => {
          const s = appMediaGate.sample();
          return (
            s.effectiveVolume === value &&
            s.mediaVolumes.length > 0 &&
            s.mediaVolumes.every(m => m.loaded && m.volume === value && m.soundVolume === value)
          );
        },
        value,
        { timeout: 25000 }
      );
  };
  await volumes(pages, 0.5);
  assert.ok((await Promise.all(pages.map(sample))).every(s => !s.sharedVolumeRecord));
  await record("default-volume-without-storage-migration", { mode: result.sharedMediaVolumeMode });
  for (const p of pages) await p.evaluate(() => appMediaGate.volume(0.91));
  await volumes(pages, 0.5);
  assert.ok(
    (await Promise.all(pages.map(sample))).every(
      s => s.sharedVolumeWrites === 0 && !s.sharedVolumeRecord
    )
  );
  await record("shared-api-disabled-for-every-role");
  await a.evaluate(() => appMediaGate.play());
  await playing(pages, backend);
  await volumes(pages, 0.5);
  await record("existing-playback-and-gesture-recovery");
  const counts = await pauseCounts(pages);
  await a.evaluate(() => appMediaGate.pause());
  await stopped(prefix + "/volume-disabled/existing-pause", pages, backend, counts);
  for (const index of [1, 2]) {
    if ((await sample(a)).page !== index)
      await a.evaluate(index => appMediaGate.page(index), index);
    await converged(pages, index);
    await volumes(pages, 0.5);
    await a.evaluate(() => appMediaGate.prepareControls());
    assert.equal(
      await a.locator('[data-e2e-media="play"]:visible').count(),
      1,
      "existing media controls still work"
    );
    for (const p of pages)
      assert.equal(
        await p.locator(".ppt-media-volume").count(),
        0,
        "disabled must not create volume DOM"
      );
    await record("no-volume-control-page-" + index);
  }
  await a.evaluate(() => appMediaGate.page(1));
  await converged(pages, 1);
  await r.evaluate(() => appMediaGate.localVolume(0.12));
  await volumes([r], 0.12);
  await volumes([a, b], 0.5);
  await record("legacy-local-volume-stays-local");
  await a.evaluate(() => appMediaGate.volumeLegacySignal(0.9));
  await new Promise(resolve => setTimeout(resolve, 350));
  await volumes([r], 0.12);
  await volumes([a, b], 0.5);
  assert.ok(
    (await Promise.all(pages.map(sample))).every(
      s => s.sharedVolumeWrites === 0 && !s.sharedVolumeRecord && s.volumeSignals.length === 0
    )
  );
  await record("legacy-shared-signal-cannot-enable-feature");
  const snapshot = await a.evaluate(() => appMediaGate.volumeSnapshot());
  await a.evaluate(
    state => appMediaGate.volumePublishSnapshot({ ...state, mediaVolume: 0.63 }),
    snapshot
  );
  const late = await openRole("reader-legacy-disabled");
  await volumes([late], 0.5);
  assert.equal(
    (await sample(late)).sharedVolume,
    0.63,
    "legacy snapshot data survives while audio feature is off"
  );
  assert.equal((await sample(late)).sharedVolumeWrites, 0);
  assert.equal((await sample(late)).sharedVolumeRecord, undefined);
  await record("legacy-room-still-loads-with-feature-off");
  await r.evaluate(() => appMediaGate.freeze());
  await r.waitForFunction(
    () => appMediaGate.sample().frozen && !appMediaGate.sample().playerExists
  );
  await r.evaluate(() => appMediaGate.unfreeze());
  await converged([r], 1);
  await volumes([r], 0.12);
  await record("frozen-restore-preserves-local-api-volume");
  await late.reload();
  await converged([late], 1);
  await volumes([late], 0.5);
  await record("reload-keeps-default-off");
  assert.ok(
    (await Promise.all(pages.map(sample))).every(
      s => s.sharedVolumeWrites === 0 && !s.sharedVolumeRecord
    )
  );
  assert.deepEqual(result.browserErrors, []);
  await record("no-shared-volume-writes-or-schema-migration");
  // A room that previously enabled the feature may already contain authority
  // data. Disabled clients must preserve that data without applying it.
  const storedRecord = {
    value: 0.91,
    changeId: "previous-enabled-room",
    taskId: snapshot.taskId,
    url: snapshot.url,
  };
  await a.evaluate(record => appMediaGate.volumePublishRecord(record), storedRecord);
  for (const p of pages)
    await p.waitForFunction(
      () => appMediaGate.sample().sharedVolumeRecord?.changeId === "previous-enabled-room"
    );
  const writesBefore = await Promise.all(pages.map(sample));
  await a.evaluate(() => appMediaGate.volume(0.2));
  await volumes([a, b, late], 0.5);
  await volumes([r], 0.12);
  await late.reload();
  await converged([late], 1);
  await volumes([late], 0.5);
  for (const [index, p] of pages.entries()) {
    const state = await sample(p);
    assert.deepEqual(state.sharedVolumeRecord, storedRecord);
    assert.equal(state.sharedVolumeWrites, p === late ? 0 : writesBefore[index].sharedVolumeWrites);
    assert.equal(await p.locator(".ppt-media-volume").count(), 0);
  }
  await record("existing-authority-data-remains-readable-but-disabled");
}
