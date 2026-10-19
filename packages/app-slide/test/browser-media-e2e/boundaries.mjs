import assert from "node:assert/strict";

export async function boundaryCoverage({
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
  const [a] = pages;
  async function document(task) {
    await a.evaluate(() => appMediaGate.removeDocument());
    await Promise.all(pages.map(p => p.waitForFunction(() => !appMediaGate.sample().resultReady)));
    await a.evaluate(task => appMediaGate.fixture(task), task);
    await Promise.all(
      pages.map(p =>
        p.waitForFunction(
          task => {
            const s = appMediaGate.sample();
            return (
              s.ready &&
              !s.frozen &&
              !s.loading &&
              s.page === 1 &&
              s.renderedPage === 1 &&
              s.resourceTaskId === task
            );
          },
          task,
          { timeout: 90000 }
        )
      )
    );
    if ((await sample(a)).storagePage == null) {
      // A recreated App can render locally before its first shared snapshot.
      // Establish the test document through real navigation, then keep every
      // storage/scene/media convergence assertion for the operation under test.
      result.initialStateNavigation ||= [];
      result.initialStateNavigation.push({ prefix, task });
      await a.evaluate(() => appMediaGate.page(3));
      await converged(pages, 3);
      await a.evaluate(() => appMediaGate.page(1));
    }
    await converged(pages, 1);
  }
  async function silence() {
    await Promise.all(
      pages.map(p =>
        p.waitForFunction(
          () => {
            const n = appMediaGate.sample().native;
            return n.activeRetiredNodes === 0 && n.activeRetiredSources === 0;
          },
          null,
          { timeout: 15000 }
        )
      )
    );
  }
  await document("media-cut");
  for (const index of [1, 2]) {
    if (index === 2) {
      await a.evaluate(() => appMediaGate.page(2));
      await converged(pages, 2);
    }
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
    const initial = await Promise.all(pages.map(sample));
    assert.ok(
      initial.every(s => Math.abs(s.clippedDuration - 12) < 0.2),
      "Use real 3s start / 15s end trim on a 30s file"
    );
    assert.ok(
      initial.every(s => s.audioTime >= 3 && s.audioTime < 15),
      "Initial playback stays inside the actual trimmed source interval"
    );
    const seekBefore = (await sample(a)).mediaSeekCount;
    await a.evaluate(() => appMediaGate.seek(6.4));
    await a.waitForFunction(
      count => {
        const s = appMediaGate.sample();
        return (
          s.mediaSeekCount > count &&
          Math.abs(s.audioTime - 9) < 0.2 &&
          (s.mediaType !== "video" || Math.abs(s.videoTime - 9) < 0.2)
        );
      },
      seekBefore,
      { timeout: 5000 }
    );
    const counts = await pauseCounts(pages);
    await a.evaluate(() => appMediaGate.pause());
    await stopped(
      prefix + "/" + (index === 1 ? "video" : "audio") + "/trim-seek-pause",
      pages,
      backend,
      counts
    );
    const paused = await Promise.all(pages.map(sample));
    assert.ok(paused.every(s => Math.abs(s.audioTime - 9) < 0.2));
    const resumeTrace = { prefix, index, before: paused, samples: [] };
    (result.trimResumeTraces ||= []).push(resumeTrace);
    let observing = true;
    const observations = (async () => {
      const deadline = Date.now() + 18000;
      while (observing && Date.now() < deadline) {
        resumeTrace.samples.push({ at: Date.now(), clients: await Promise.all(pages.map(sample)) });
        await a.waitForTimeout(100);
      }
    })();
    await a.evaluate(() => appMediaGate.play());
    try { await playing(pages, backend); }
    finally { observing = false; await observations; }
    await Promise.all(
      pages.map(p =>
        p.waitForFunction(
          () => {
            const s = appMediaGate.sample();
            return !s.isPlaying && s.audioPaused && (s.mediaType !== "video" || s.videoPaused);
          },
          null,
          { timeout: 15000 }
        )
      )
    );
    await checkpoint(prefix + "/" + (index === 1 ? "video" : "audio") + "/trim-natural-end", pages);
    await Promise.all(
      pages.map(p =>
        p.waitForFunction(
          () => {
            const s = appMediaGate.sample();
            return (
              !s.engineMediaState?.type &&
              !s.storageMediaState?.type &&
              Math.abs(s.audioTime - s.trimStart) < 0.2
            );
          },
          null,
          { timeout: 15000 }
        )
      )
    );
    await a.waitForTimeout(600);
    await a.evaluate(() => appMediaGate.play());
    await playing(pages, backend);
    const replay = await Promise.all(pages.map(sample));
    assert.ok(
      replay.every(s => s.audioTime >= 3 && s.audioTime < 6),
      "Replay starts at the trim boundary"
    );
    const replayCounts = await pauseCounts(pages);
    await a.evaluate(() => appMediaGate.pause());
    await stopped(
      prefix + "/" + (index === 1 ? "video" : "audio") + "/trim-replay-pause",
      pages,
      backend,
      replayCounts
    );
    await silence();
  }
  await document("media-multiple");
  for (const index of [0, 1]) {
    await a.evaluate(index => appMediaGate.playMedia(index), index);
    for (const p of pages) {
      await p.waitForFunction(
        index => {
          const m = appMediaGate.sample().allMedias[index];
          return m?.needsGesture || (m?.playing && m.audioPaused === false && m.audioTime > 0.1);
        },
        index,
        { timeout: 30000 }
      );
      if ((await sample(p)).allMedias[index].needsGesture)
        await p.locator("#media-permission").click();
    }
  }
  await Promise.all(
    pages.map(p =>
      p.waitForFunction(
        () => {
          const s = appMediaGate.sample();
          return s.mediaCount === 2 && s.allMedias.every(m => m.playing && m.time > 0.1);
        },
        null,
        { timeout: 30000 }
      )
    )
  );
  for (const index of [0, 1]) {
    await a.evaluate(index => appMediaGate.pauseMedia(index), index);
    await Promise.all(
      pages.map(p =>
        p.waitForFunction(index => !appMediaGate.sample().allMedias[index]?.playing, index, {
          timeout: 15000,
        })
      )
    );
  }
  await Promise.all(
    pages.map(p =>
      p.waitForFunction(
        () => {
          const s = appMediaGate.sample();
          return (
            s.allMedias.length === 2 &&
            s.allMedias.every(m => !m.playing) &&
            Object.values(s.storedMediaStates).filter(m => m.type === "pause").length === 2 &&
            s.native.activeSources === 0 &&
            s.native.nodes.every(n => n.paused || n.ended)
          );
        },
        null,
        { timeout: 30000 }
      )
    )
  );
  await silence();
  await checkpoint(prefix + "/multiple-media-pause-no-ghost-audio", pages);
  await a.evaluate(() => appMediaGate.playAll());
  await Promise.all(
    pages.map(p =>
      p.waitForFunction(
        () => {
          const s = appMediaGate.sample();
          return s.allMedias.length === 2 && s.allMedias.every(m => m.playing && !m.audioPaused);
        },
        null,
        { timeout: 15000 }
      )
    )
  );
  await a.evaluate(() => appMediaGate.pauseAll());
  await Promise.all(
    pages.map(p =>
      p.waitForFunction(
        () => {
          const s = appMediaGate.sample();
          return (
            s.allMedias.length === 2 &&
            s.allMedias.every(m => !m.playing && m.audioPaused) &&
            Object.values(s.storedMediaStates).filter(m => m.type === "pause").length === 2 &&
            s.native.activeSources === 0 &&
            s.native.nodes.every(n => n.paused || n.ended)
          );
        },
        null,
        { timeout: 15000 }
      )
    )
  );
  await silence();
  await checkpoint(prefix + "/multiple-media-rapid-independent-signals", pages);

  result.injectMediaFailure = true;
  const errorsBefore = result.injectedFailures || 0;
  const logsBefore = (result.expectedMediaLoadErrors || []).length;
  await document("media-failure");
  try {
    await a.waitForFunction(
      () => {
        const s = appMediaGate.sample();
        return s.audioPaused && s.clippedDuration === 0;
      },
      null,
      { timeout: 15000 }
    );
    const deadline = Date.now() + 15000;
    while ((result.injectedFailures || 0) === errorsBefore && Date.now() < deadline)
      await a.waitForTimeout(100);
    assert.ok(result.injectedFailures > errorsBefore, "Must fail a real media HTTP request");
    while (
      new Set((result.expectedMediaLoadErrors || []).slice(logsBefore).map(e => e.role)).size < 3 &&
      Date.now() < deadline
    )
      await a.waitForTimeout(100);
    assert.equal(
      new Set((result.expectedMediaLoadErrors || []).slice(logsBefore).map(e => e.role)).size,
      3,
      "Every real client must surface the controlled media failure before retry"
    );
    await silence();
    await checkpoint(prefix + "/media-http-failure-silent", pages);
  } finally {
    result.injectMediaFailure = false;
  }
  await document("media-failure");
  await a.evaluate(() => appMediaGate.play());
  await playing(pages, backend);
  const counts = await pauseCounts(pages);
  await a.evaluate(() => appMediaGate.pause());
  await stopped(prefix + "/media-http-retry-after-recreate", pages, backend, counts);
  await silence();
  await document("media-fixture");
}
