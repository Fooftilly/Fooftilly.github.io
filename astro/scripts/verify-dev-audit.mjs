/** Verify the internal parity manifest stays inaccessible in the real Astro dev server. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const freePort = async () => {
  const socket = createServer();
  await new Promise((done, fail) => {
    socket.once("error", fail);
    socket.listen(0, "127.0.0.1", done);
  });
  const port = socket.address().port;
  await new Promise((done) => socket.close(done));
  return port;
};

const port = await freePort();
const base = "http://127.0.0.1:" + port;
const executable = resolve("node_modules/.bin/astro");
const server = spawn(executable, ["dev", "--host", "127.0.0.1", "--port", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
let spawnError;
for (const pipe of [server.stdout, server.stderr]) {
  pipe.setEncoding("utf8");
  pipe.on("data", (s) => { output = (output + s).slice(-6000); });
}
server.on("error", (error) => { spawnError = error; });

try {
  let started = false;
  for (let i = 0; i < 140; i++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error("Astro dev exited early: " + output);
    try {
      const response = await fetch(base + "/", { signal: AbortSignal.timeout(3000) });
      if (response.status === 200) { started = true; break; }
    } catch { /* Not listening yet. */ }
    await sleep(100);
  }
  assert.ok(started, "Astro dev did not become healthy: " + output);
  const response = await fetch(base + "/migration-audit/bookmarks-parity.json");
  const data = await response.text();
  assert.equal(response.status, 404, "Internal audit endpoint must be unavailable in dev");
  assert.ok(!data.includes('"rawLink"') && !data.includes('"comments"'),
    "Internal bookmark manifest leaked through the dev route");
  assert.equal(response.headers.get("cache-control"), "no-store");
  console.log("Astro dev: root page 200, internal audit endpoint 404; no manifest exposure");
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((done) => server.once("exit", done)),
    sleep(1500),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
