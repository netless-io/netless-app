import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const dir = path.dirname(fileURLToPath(import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), "app-slide-sync-test-"));
try {
  for (const name of ["SceneSync", "SlideControllerSync", "BootstrapStorage"]) {
    const outfile = path.join(output, `${name}.cjs`);
    await build({
      entryPoints: [path.join(dir, `${name}.test.ts`)],
      outfile,
      bundle: true,
      platform: "node",
      format: "cjs",
      define: { "import.meta.env.DEV": "false" },
      plugins: [
        {
          name: "slide-render-stub",
          setup(builder) {
            builder.onResolve({ filter: /^@netless\/slide$/ }, () => ({
              path: path.join(dir, "fixtures/SlideStub.ts"),
            }));
          },
        },
      ],
    });
    const result = spawnSync(process.execPath, [outfile], { stdio: "inherit", timeout: 10_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${name} failed: ${result.status}`);
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
