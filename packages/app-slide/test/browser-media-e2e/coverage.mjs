import assert from "node:assert/strict";

export async function extendedCoverage({
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
}) {
  const [a, b, reader] = pages;
  const rows = () => Promise.all(pages.map(sample));
  const writes = list => list.map(s => ({ state: s.stateWrites, scene: s.sceneWrites }));
  const unchanged = (before, after) =>
    after.forEach((s, i) => {
      assert.equal(
        s.stateWrites,
        before[i].state,
        "Passive writable/readonly recovery must not publish state"
      );
      assert.equal(
        s.sceneWrites,
        before[i].scene,
        "Passive recovery must not publish scene changes"
      );
    });
  async function quiet(targets, frozen = false) {
    await Promise.all(
      targets.map(page =>
        page.waitForFunction(
          frozen => {
            const s = appMediaGate.sample(),
              n = s.native;
            return (
              (!frozen || (s.frozen && !s.playerExists)) &&
              n &&
              n.activeRetiredNodes === 0 &&
              n.activeRetiredSources === 0 &&
              (!frozen || (n.activeSources === 0 && n.nodes.every(n => n.paused || n.ended)))
            );
          },
          frozen,
          { timeout: 15000 }
        )
      )
    );
    const before = await Promise.all(targets.map(sample));
    await a.waitForTimeout(450);
    const after = await Promise.all(targets.map(sample));
    after.forEach((s, i) => {
      assert.equal(s.native.activeRetiredNodes, 0);
      assert.equal(s.native.activeRetiredSources, 0);
      for (const node of s.native.nodes.filter(n => !n.current)) {
        const old = before[i].native.nodes.find(n => n.id === node.id);
        if (old) assert.ok(Math.abs(node.time - old.time) < 0.05, "Retired native clock must stop");
      }
    });
  }
  async function syncPosition(targets) {
    await Promise.all(
      targets.map(page =>
        page.waitForFunction(
          () => {
            const s = appMediaGate.sample();
            const expected = (s.now - s.storageMediaState?.time) / 1000;
            return (
              s.storageMediaState?.type === "play" &&
              Math.abs(s.audioTime - Math.floor(expected)) < 1.25 &&
              (s.mediaType !== "video" || Math.abs(s.videoTime - Math.floor(expected)) < 1.25)
            );
          },
          null,
          { timeout: 15000 }
        )
      )
    );
  }
  async function reset(index) {
    if ((await sample(a)).page !== 3) {
      await a.evaluate(() => appMediaGate.page(3));
      await converged(pages, 3);
    }
    await quiet(pages);
    await a.evaluate(index => appMediaGate.page(index), index);
    await converged(pages, index);
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
  }
  async function pauseAll(label) {
    const before = await pauseCounts(pages);
    await a.evaluate(() => appMediaGate.pause());
    await stopped(prefix + "/" + label, pages, backend, before);
    await quiet(pages);
  }
  for (const index of [1, 2]) {
    const kind = index === 1 ? "video" : "audio";
    result.extendedInProgress = { prefix, kind };
    await reset(index);
    const pendingCounts = await pauseCounts(pages);
    const pending = await a.evaluate(() => appMediaGate.cancelActiveSeek());
    if (backend === "html5") {
      assert.equal(pending.nativePlayPending, true, "Must hit the real native-play lock");
      assert.equal(pending.retired, true, "Pending Howl must be retired");
      assert.equal(pending.reusedRetiredNode, false, "Pending canplay node cannot be recycled");
    }
    await stopped(
      prefix + "/" + kind + "/deterministic-native-seek-cancel",
      pages,
      backend,
      pendingCounts
    );
    await quiet(pages);
    // Passive writable and readonly clients release their own decoders only.
    await reset(index);
    let before = await rows(),
      passiveWrites = writes([before[1], before[2]]);
    const shared = before[0].storageMediaState;
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freeze())));
    await quiet([b, reader], true);
    await playing([a], backend);
    let frozen = await rows();
    unchanged(passiveWrites, [frozen[1], frozen[2]]);
    for (const s of frozen)
      assert.deepEqual(
        s.storedMediaStates[before[0].mediaId],
        shared,
        "Local freeze must retain room play state"
      );
    assert.equal(frozen[1].writable, true);
    assert.equal(frozen[2].writable, false);
    assert.ok(
      frozen[1].frozenCalls > before[1].frozenCalls && frozen[2].frozenCalls > before[2].frozenCalls
    );
    await checkpoint(prefix + "/" + kind + "/frozen-writable-readonly-silent", pages);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, index);
    await playing(pages, backend);
    await syncPosition([b, reader]);
    await quiet(pages);
    let after = await rows();
    unchanged(passiveWrites, [after[1], after[2]]);
    assert.ok(
      after[1].releaseCalls > before[1].releaseCalls &&
        after[2].releaseCalls > before[2].releaseCalls
    );
    await checkpoint(prefix + "/" + kind + "/release-writable-readonly-follow-play", pages);
    await pauseAll(kind + "/release-play-then-pause");
    const pausedBefore = await rows();
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freeze())));
    await quiet([b, reader], true);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, index);
    await stopped(
      prefix + "/" + kind + "/paused-frozen-release-stays-paused",
      pages,
      backend,
      [0, 0, 0]
    );
    unchanged(writes(pausedBefore.slice(1)), (await rows()).slice(1));
    await quiet(pages);

    await reset(index);
    before = await rows();
    const allWrites = writes(before);
    await Promise.all(pages.map(p => p.evaluate(() => appMediaGate.freeze())));
    await quiet(pages, true);
    const allFrozen = await rows();
    unchanged(allWrites, allFrozen);
    assert.ok(allFrozen.every(s => s.storedMediaStates[before[0].mediaId].type === "play"));
    await checkpoint(prefix + "/" + kind + "/all-clients-frozen-local-silence", pages);
    await Promise.all(pages.map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, index);
    await playing(pages, backend);
    await syncPosition(pages);
    unchanged(allWrites, await rows());
    await quiet(pages);
    await checkpoint(prefix + "/" + kind + "/all-clients-release-follow-room-clock", pages);
    await pauseAll(kind + "/all-release-pause");
    await reset(index);
    before = await rows();
    const stoppedWrites = writes(before.slice(1));
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freeze())));
    await a.evaluate(() => appMediaGate.stop());
    await a.waitForFunction(() => !appMediaGate.sample().storageMediaState?.type);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, index);
    await Promise.all(
      pages.map(p =>
        p.waitForFunction(
          () => {
            const s = appMediaGate.sample();
            return (
              !s.isPlaying &&
              s.audioPaused &&
              !s.storageMediaState?.type &&
              (s.mediaType !== "video" || s.videoPaused)
            );
          },
          null,
          { timeout: 15000 }
        )
      )
    );
    unchanged(stoppedWrites, (await rows()).slice(1));
    await quiet(pages);
    await checkpoint(prefix + "/" + kind + "/release-follows-stop-removing-shared-media", pages);

    // The initiating writer may freeze; another writer owns the later pause.
    await reset(index);
    before = await rows();
    const authorWrites = writes([before[0], before[2]]);
    await a.evaluate(() => appMediaGate.freeze());
    await quiet([a], true);
    await playing([b, reader], backend);
    await b.evaluate(() => appMediaGate.seek(7.4));
    await b.waitForFunction(
      () => appMediaGate.sample().audioTime >= 7 && appMediaGate.sample().audioTime < 10,
      null,
      { timeout: 15000 }
    );
    const prior = await pauseCounts([b, reader]);
    await b.evaluate(() => appMediaGate.pause());
    await stopped(
      prefix + "/" + kind + "/other-writer-pauses-frozen-author",
      [b, reader],
      backend,
      prior
    );
    await a.waitForFunction(
      id => appMediaGate.sample().storedMediaStates?.[id]?.type === "pause",
      before[0].mediaId,
      { timeout: 15000 }
    );
    const authorStarts = (await sample(a)).native.audioStarts;
    await a.evaluate(() => appMediaGate.unfreeze());
    await converged(pages, index);
    // Existing pause signal belongs to B; restoring A must never author a new pause.
    await stopped(
      prefix + "/" + kind + "/release-author-follows-latest-pause",
      pages,
      backend,
      [0, 0, 0]
    );
    await quiet(pages);
    after = await rows();
    unchanged(authorWrites, [after[0], after[2]]);
    assert.ok(after.every(s => Math.abs(s.audioTime - 7) < 0.2));
    assert.equal(
      after[0].native.audioStarts,
      authorStarts,
      "Release under latest pause must not transiently start the frozen play snapshot"
    );

    // No participant can replay stale local play when room state changed while frozen.
    await reset(index);
    before = await rows();
    passiveWrites = writes([before[1], before[2]]);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freeze())));
    await quiet([b, reader], true);
    await a.evaluate(() => appMediaGate.seek(4.4));
    await a.waitForFunction(
      () => appMediaGate.sample().audioTime >= 4 && appMediaGate.sample().audioTime < 7,
      null,
      { timeout: 15000 }
    );
    await a.evaluate(() => appMediaGate.pause());
    await a.waitForFunction(() => appMediaGate.sample().storageMediaState?.type === "pause");
    const pausedState = (await sample(a)).storageMediaState;
    // The release contract uses the latest state received by this client. Wait
    // for transport delivery while its player remains frozen; an in-flight
    // remote pause cannot yet suppress a locally authoritative play snapshot.
    await Promise.all(
      [b, reader].map(p =>
        p.waitForFunction(
          ({ id, time }) => {
            const s = appMediaGate.sample();
            const state = s.storedMediaStates?.[id];
            return s.frozen && !s.playerExists && state?.type === "pause" && state.time === time;
          },
          { id: before[0].mediaId, time: pausedState.time },
          { timeout: 15000 }
        )
      )
    );
    const pausedReleaseStarts = (await rows()).slice(1).map(s => s.native.audioStarts);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, index);
    await stopped(
      prefix + "/" + kind + "/release-follows-pause-during-frozen",
      pages,
      backend,
      [0, 0, 0]
    );
    unchanged(passiveWrites, (await rows()).slice(1));
    (await rows())
      .slice(1)
      .forEach((s, i) =>
        assert.equal(
          s.native.audioStarts,
          pausedReleaseStarts[i],
          "Neither passive writable nor readonly release may transiently play a stale snapshot"
        )
      );
    await quiet(pages);

    await reset(index);
    before = await rows();
    passiveWrites = writes([before[1], before[2]]);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freeze())));
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freezeWhileRestoring())));
    await quiet([b, reader], true);
    await playing([a], backend);
    await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.unfreeze())));
    await converged(pages, index);
    await playing(pages, backend);
    await syncPosition([b, reader]);
    unchanged(passiveWrites, (await rows()).slice(1));
    await quiet(pages);
    await checkpoint(prefix + "/" + kind + "/refreeze-during-playing-release", pages);
    await pauseAll(kind + "/refreeze-recovery-pause");

    await reset(index);
    before = await rows();
    for (const p of [b, reader]) {
      const old = await sample(p);
      await p.evaluate(() => appMediaGate.reconnect());
      await p.waitForFunction(epoch => appMediaGate.sample().epoch > epoch, old.epoch, {
        timeout: 90000,
      });
      await converged(pages, index);
      await playing(pages, backend);
      await syncPosition([p]);
      await quiet(pages);
    }
    unchanged(writes(before.slice(1)), (await rows()).slice(1));
    await checkpoint(prefix + "/" + kind + "/reconnect-while-playing", pages);
    await pauseAll(kind + "/reconnect-recovery-pause");
  }
  // Restore a different page and media ID; the old decoder must never revive.
  await reset(1);
  let before = await rows();
  await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.freeze())));
  await a.evaluate(() => appMediaGate.page(2));
  await converged([a], 2);
  await a.evaluate(() => appMediaGate.play());
  await playing([a], backend);
  let delayedMetadataRequests = 0;
  await reader.route("**/fixture/media.mp3", async route => {
    delayedMetadataRequests++;
    await reader.waitForTimeout(1800);
    await route.continue();
  });
  await Promise.all([b, reader].map(p => p.evaluate(() => appMediaGate.unfreeze())));
  await converged(pages, 2);
  await playing(pages, backend);
  await syncPosition([b, reader]);
  await quiet(pages);
  unchanged(writes(before.slice(1)), (await rows()).slice(1));
  await checkpoint(prefix + "/frozen-page-change-release", pages);
  await reader.unroute("**/fixture/media.mp3");
  assert.ok(
    delayedMetadataRequests > 0,
    "Readonly release must encounter a real delayed media response"
  );
  await checkpoint(prefix + "/frozen-release-delayed-metadata-follows-room-clock", pages);
  await pauseAll("page-change-release-pause");

  // Real pointer events traverse hit testing and the native progress controller.
  await reset(1);
  await a.evaluate(() => appMediaGate.prepareControls());
  await a.locator('[data-e2e-media="progress"]').click({ position: { x: 40, y: 5 } });
  const prior = await pauseCounts(pages);
  await a.evaluate(() => appMediaGate.prepareControls());
  await a.locator('[data-e2e-media="pause"]').click();
  await stopped(prefix + "/real-pointer-progress-pause", pages, backend, prior);
  await quiet(pages);
  await a.evaluate(() => appMediaGate.prepareControls());
  await a.locator('[data-e2e-media="play"]').click();
  await playing(pages, backend);
  await pauseAll("real-pointer-replay-pause");

  await reset(1);
  await a.evaluate(() => appMediaGate.removeDocument());
  await Promise.all(pages.map(p => p.waitForFunction(() => !appMediaGate.sample().resultReady)));
  await quiet(pages);
  const removed = await rows();
  assert.ok(
    removed.every(
      s => s.native.activeSources === 0 && s.native.nodes.every(n => n.paused || n.ended)
    )
  );
  await checkpoint(prefix + "/close-app-while-playing-no-ghost-audio", pages);
  await a.evaluate(() => appMediaGate.fixture());
  await converged(pages, 1);
  delete result.extendedInProgress;
}
