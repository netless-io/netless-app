import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(
  process.env.APP_SLIDE_VOLUME_OUTPUT || path.join(root, ".results", "volume-" + Date.now())
);
await fs.mkdir(output, { recursive: true });
const result = {
  passed: false,
  scope: "app-slide-volume-room-matrix",
  profiles: [],
  startedAt: new Date().toISOString(),
};
const save = () =>
  fs.writeFile(path.join(output, "matrix.json"), JSON.stringify(result, null, 2) + "\n");
await save();
try {
  assert.ok(process.env.APP_SLIDE_E2E_CONFIG, "Private room config required");
  assert.ok(!process.env.SLIDE_CANDIDATE_DIR, "Use the actual installed npm alpha package");
  const profiles = [];
  for (const browser of ["chromium", "webkit"])
    for (const mode of ["1.0", "1.5"])
      for (const backend of ["html5", "webaudio"])
        profiles.push({ browser, mode, backend, autoplay: "allowed" });
  for (const mode of ["1.0", "1.5"])
    for (const backend of ["html5", "webaudio"])
      profiles.push({ browser: "chromium", mode, backend, autoplay: "blocked" });
  let artifact;
  for (const profile of profiles) {
    const name = `${profile.browser}-${profile.mode}-${profile.backend}-${profile.autoplay}`;
    const dir = path.join(output, name);
    const log = await fs.open(path.join(output, name + ".log"), "w");
    const code = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, "run.mjs")], {
        env: {
          ...process.env,
          APP_SLIDE_E2E_DIAGNOSTIC: "volume",
          APP_SLIDE_E2E_DIAGNOSTIC_MODE: profile.mode,
          APP_SLIDE_E2E_DIAGNOSTIC_BACKEND: profile.backend,
          APP_SLIDE_E2E_BROWSER: profile.browser,
          APP_SLIDE_E2E_AUTOPLAY: profile.autoplay,
          APP_SLIDE_E2E_OUTPUT: dir,
        },
        stdio: ["ignore", log.fd, log.fd],
      });
      child.once("error", reject);
      child.once("exit", resolve);
    });
    await log.close();
    const reportPath = path.join(
      dir,
      profile.browser === "webkit"
        ? "webkit"
        : profile.autoplay === "blocked"
        ? "autoplay-blocked"
        : "",
      "results.json"
    );
    const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
    const row = {
      ...profile,
      report: reportPath,
      exitCode: code,
      passed: report.passed,
      cases: report.cases.length,
      slideVersion: report.slideVersion,
      slideSHA256: report.slideSHA256,
      appSHA256: report.appSHA256,
      cleanup: report.cleanup,
      error: report.error,
    };
    result.profiles.push(row);
    await save();
    assert.equal(code, 0, name + " process failed");
    assert.equal(report.passed, true, name + " acceptance failed");
    assert.equal(report.slideArtifact, "installed-npm");
    assert.equal(report.scope, "diagnostic/volume");
    assert.ok(report.cases.length >= 25, "Complete volume scenarios required");
    assert.equal(report.cleanup.length, 1, "One owned room per profile");
    assert.ok(report.cleanup.every(r => r.isBan && !r.isRecord && !r.failed));
    const identity = JSON.stringify([report.slideVersion, report.slideSHA256, report.appSHA256]);
    if (!artifact) artifact = identity;
    assert.equal(identity, artifact, "All profiles must use identical artifacts");
    console.log("PASS " + name + " " + row.cases + " checkpoints; room cleaned");
  }
  assert.equal(result.profiles.length, 12);
  result.passed = true;
} catch (error) {
  result.error = error.message;
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify({
      output,
      passed: result.passed,
      profiles: result.profiles.length,
      error: result.error,
    })
  );
}
