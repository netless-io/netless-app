import { createServer, build } from "vite";
import { readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(root, "../../../..");
const isBuild = process.argv.includes("--build");
const configPath = process.env.APP_SLIDE_E2E_CONFIG;
let config;
if (configPath && !isBuild) config = JSON.parse(readFileSync(configPath, "utf8"));
const runId = `origin-${Date.now()}`;
const evidenceDir = path.resolve(
  process.env.APP_SLIDE_E2E_OUTPUT || path.join(project, "outputs", runId)
);

async function postSdk(endpoint, body) {
  const response = await fetch(`https://api.netless.link/v5/${endpoint}`, {
    method: "POST",
    headers: {
      token: config.sdkToken,
      region: config.region || "cn-hz",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Test-room API HTTP ${response.status}`);
  return response.json();
}
if (config?.sdkToken) {
  config.rooms = {};
  for (const mode of ["1.0", "1.5"]) {
    const room = await postSdk("rooms", { isRecord: false, limit: 0 });
    const roomToken = await postSdk(`tokens/rooms/${room.uuid}`, {
      role: "admin",
      lifespan: 2 * 60 * 60 * 1000,
    });
    config.rooms[mode] = { uuid: room.uuid, roomToken };
  }
}
if (
  config &&
  (!config.appIdentifier || !config.rooms?.["1.0"]?.roomToken || !config.rooms?.["1.5"]?.roomToken)
) {
  throw new Error("Provide appIdentifier and two isolated test rooms (or sdkToken)");
}
const vite = {
  root,
  configFile: false,
  define: { "import.meta.env.DEV": "false" },
  resolve: { dedupe: ["white-web-sdk", "@netless/window-manager"] },
  server: {
    host: "127.0.0.1",
    port: 5188,
    strictPort: true,
    hmr: false,
    fs: { allow: [project] },
  },
  build: {
    outDir: path.join(root, ".build"),
    emptyOutDir: true,
    commonjsOptions: { include: [/node_modules/] },
  },
};
if (isBuild) {
  await build(vite);
} else {
  mkdirSync(evidenceDir, { recursive: true });
  const server = await createServer({
    ...vite,
    plugins: [
      {
        name: "isolated-sync-test-api",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = new URL(req.url || "/", "http://127.0.0.1:5188");
            if (url.pathname === "/__sync/config") {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Cache-Control", "no-store");
              const mode = url.searchParams.get("mode");
              const room = config?.rooms?.[mode];
              if (!room) {
                res.statusCode = 503;
                res.end(JSON.stringify({ error: "Missing isolated-room config" }));
                return;
              }
              res.end(
                JSON.stringify({
                  appIdentifier: config.appIdentifier,
                  region: config.region || "cn-hz",
                  ...room,
                  runId,
                  taskId: config.taskId || "18c7cd58ba674dc4aed6f0c620964589",
                  prefix: config.prefix || "https://convertcdn.netless.link/dynamicConvert",
                })
              );
            } else if (url.pathname === "/__sync/evidence" && req.method === "POST") {
              let body = "";
              req.on("data", chunk => {
                body += chunk;
                if (body.length > 50_000) req.destroy();
              });
              req.on("end", () => {
                try {
                  const value = JSON.parse(body);
                  // Allow only non-secret observation fields from the controlled harness.
                  const safe = Object.fromEntries(
                    [
                      "at",
                      "mode",
                      "role",
                      "kind",
                      "page",
                      "origin",
                      "appId",
                      "observerId",
                      "type",
                      "clientId",
                      "creator",
                      "storagePage",
                      "scene",
                      "pluginScene",
                      "sceneNames",
                    ]
                      .filter(key => value[key] !== undefined)
                      .map(key => [key, value[key]])
                  );
                  if (safe.origin)
                    safe.origin = {
                      clientId: safe.origin.clientId,
                      authorId: safe.origin.authorId,
                    };
                  appendFileSync(
                    path.join(evidenceDir, "events.jsonl"),
                    `${JSON.stringify(safe)}\n`
                  );
                  res.end("ok");
                } catch {
                  res.statusCode = 400;
                  res.end("Invalid observation");
                }
              });
            } else next();
          });
        },
      },
    ],
  });
  await server.listen();
  console.log(`Browser harness: http://127.0.0.1:5188/?mode=1.0&role=writer-a`);
  console.log(`Isolated rooms configured: ${Boolean(config)}; evidence: ${evidenceDir}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await server.close();
      process.exit(0);
    });
}
