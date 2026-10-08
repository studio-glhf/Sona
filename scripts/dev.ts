import { spawn, spawnSync, type ChildProcess } from "node:child_process";
const grouped = process.platform !== "win32";
const server = spawn(
  process.execPath,
  ["node_modules/tsx/dist/cli.mjs", "watch", "apps/server/src/index.ts"],
  {
    stdio: "inherit",
    detached: grouped,
    env: { ...process.env, NODE_ENV: "development" },
  },
);
const web = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "apps/web", "--host", "127.0.0.1"],
  { stdio: "inherit", detached: grouped },
);
let stopping = false;
function terminate(child: ChildProcess, force = false) {
  if (!child.pid) return;
  try {
    if (grouped) process.kill(-child.pid, force ? "SIGKILL" : "SIGTERM");
    else
      spawnSync(
        "taskkill",
        ["/pid", String(child.pid), "/T", ...(force ? ["/F"] : [])],
        { stdio: "ignore" },
      );
  } catch {
    /* The owned process group already ended. */
  }
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  terminate(server);
  terminate(web);
  setTimeout(() => {
    terminate(server, true);
    terminate(web, true);
  }, 5000).unref();
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of [server, web]) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 0));
}
