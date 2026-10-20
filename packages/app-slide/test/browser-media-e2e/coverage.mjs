import assert from "node:assert/strict";

export async function extendedCoverage({
  prefix,
  pages,
  backend,
  sample,
  converged,
  playing,
  seekWhilePlaying,
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
    if (backend === "html5") {
      await reset(index);
      const counts = await pauseCounts(pages);
      const native = await a.evaluate(() => appMediaGate.cancelUnlockedNativeSeek());
      assert.equal(native.observed.audioNodeSeeking, true, "Must observe the real native seek");
      assert.equal(
        native.observed.howlLock,
        false,
        "Howler's play promise must already be unlocked"
      );
      result.nativeSeekWindows ||= [];
      result.nativeSeekWindows.push({ prefix, kind, ...native });
      await stopped(prefix + "/" + kind + "/native-seeking-unlocked-pause", pages, backend, counts);
      await quiet(pages);
      await checkpoint(prefix + "/" + kind + "/native-seeking-unlocked-pause", pages);
    }
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
    await Promise.all(
      [b, reader].map(p =>
        p.waitForFunction(
          id => {
            const s = appMediaGate.sample();
            return s.frozen && !s.playerExists && !s.storedMediaStates?.[id];
          },
          before[0].mediaId,
          { timeout: 15000 }
        )
      )
    );
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
    await seekWhilePlaying(b, 7.4);
    const prior = await pauseCounts([b, reader]);
    await b.evaluate(() => appMediaGate.pause());
    await stopped(
      prefix + "/" + kind + "/other-writer-pauses-frozen-author",
      [b, reader],
      backend,
      prior
    );
    // The seek target is approximate: playback and room transport continue
    // until B's pause is authored. Recovery must use that actual pause time.
    const authorPausedState = (await sample(b)).storageMediaState;
    await a.waitForFunction(
      ({ id, time }) => {
        const state = appMediaGate.sample().storedMediaStates?.[id];
        return state?.type === "pause" && state.time === time;
      },
      { id: before[0].mediaId, time: authorPausedState.time },
      { timeout: 15000 }
    );
    const beforeAuthorRelease = await sample(a);
    const authorStarts = beforeAuthorRelease.native.audioStarts;
    result.authorPauseRelease = { before: beforeAuthorRelease, expectedPause: authorPausedState };
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
    result.authorPauseRelease.after = after[0];
    unchanged(authorWrites, [after[0], after[2]]);
    for (const s of after) {
      assert.deepEqual(s.engineMediaState, authorPausedState);
      assert.deepEqual(s.storageMediaState, authorPausedState);
      const expectedPosition = Math.floor(authorPausedState.time) + s.trimStart;
      assert.ok(Math.abs(s.audioTime - expectedPosition) < 0.2);
      if (s.mediaType === "video") assert.ok(Math.abs(s.videoTime - expectedPosition) < 0.2);
    }
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
    await seekWhilePlaying(a, 4.4);
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
    assert.ok(
      before.every(
        s => Number.isFinite(s.clippedDuration) && s.clippedDuration - s.audioTime > 200
      ),
      "Reconnect requires more than 200 seconds of remaining real media"
    );
    result.mediaPreconditions ||= [];
    result.mediaPreconditions.push({
      label: prefix + "/" + kind + "/reconnect",
      remaining: before.map(s => s.clippedDuration - s.audioTime),
    });
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
    try {
      await reader.waitForTimeout(1800);
      await route.continue();
    } catch (error) {
      // Browser shutdown already fails the owning test. A pending delay must
      // not crash Node before the runner can execute its room-cleanup finally.
      if (!reader.isClosed() && reader.context().browser()?.isConnected()) throw error;
    }
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

  // Keep real MP3 bytes unavailable after video metadata is ready. Resource
  // preparation must outlive the separate 15s native playback deadline.
  await reset(1);
  before = await rows();
  await reader.evaluate(() => appMediaGate.freeze());
  await quiet([reader], true);
  let releaseAudio;
  const audioGate = new Promise(resolve => {
    releaseAudio = resolve;
  });
  let delayedAudioRequests = 0;
  const delayedAudioRoute = async route => {
    delayedAudioRequests++;
    try {
      await audioGate;
      await route.continue();
    } catch (error) {
      if (!reader.isClosed() && reader.context().browser()?.isConnected())
        result.browserErrors.push("Delayed video audio route: " + error.message);
    }
  };
  await reader.route("**/fixture/media.mp3", delayedAudioRoute);
  let restore;
  try {
    // Consume rejection immediately, then assert it after releasing the bytes.
    restore = reader
      .evaluate(() => appMediaGate.unfreeze())
      .then(
        () => ({ passed: true }),
        error => ({ passed: false, error })
      );
    await reader.waitForFunction(
      () => {
        const s = appMediaGate.sample();
        return (
          s.mediaFailure ||
          (s.mediaType === "video" &&
            s.videoReadyState >= 1 &&
            s.videoDuration > 0 &&
            s.howlState === "loading" &&
            s.audioPaused === true &&
            s.audioExecution?.desiredPlaying === true &&
            s.engineMediaState?.type === "play" &&
            s.storageMediaState?.type === "play")
        );
      },
      null,
      { timeout: 15000 }
    );
    const ready = await sample(reader);
    assert.ok(!ready.mediaFailure, "Video audio must still be preparing");
    assert.ok(delayedAudioRequests > 0, "Intercept a real independent MP3 request");
    const readyAt = Date.now();
    await reader.waitForTimeout(18000);
    const beforeBytes = await sample(reader);
    const delayMs = Date.now() - readyAt;
    assert.ok(delayMs >= 18000);
    assert.equal(beforeBytes.howlState, "loading");
    assert.ok(
      !beforeBytes.mediaFailure,
      "Resource preparation must not use the native 15s deadline"
    );
    assert.equal(beforeBytes.audioPaused, true);
    assert.equal(beforeBytes.audioExecution?.desiredPlaying, true);
    assert.equal(beforeBytes.engineMediaState?.type, "play");
    assert.equal(beforeBytes.storageMediaState?.type, "play");
    releaseAudio();
    let restoreTimer;
    try {
      const restored = await Promise.race([
        restore,
        new Promise((_, reject) => {
          restoreTimer = setTimeout(
            () => reject(Error("Delayed-audio release did not finish")),
            60000
          );
        }),
      ]);
      if (!restored.passed) throw restored.error;
    } finally {
      clearTimeout(restoreTimer);
    }
    await converged(pages, 1);
    await playing(pages, backend);
    await syncPosition([b, reader]);
    await quiet(pages);
    unchanged(writes(before.slice(1)), (await rows()).slice(1));
    await checkpoint(prefix + "/video-release-delayed-audio-follows-room-clock", pages, {
      delayMs,
      delayedAudioRequests,
      ready,
      beforeBytes,
    });
  } finally {
    releaseAudio();
    await reader.unroute("**/fixture/media.mp3", delayedAudioRoute);
  }
  await pauseAll("video-release-delayed-audio-pause");

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
