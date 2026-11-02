/** End-to-end smoke test: isolated admin Astro build and Vue bookmark drafts.
 * Node 24 WebSocket + Chromium DevTools avoid adding browser npm dependencies.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const dist = resolve("admin-dist");
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".xml": "application/xml; charset=utf-8",
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = resolve(dist, "." + pathname);
    if (file !== dist && !file.startsWith(dist + sep)) throw new Error("Unsafe path");
    if (pathname.endsWith("/") || !extname(file)) file = join(file, "index.html");
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": mime[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const profile = await mkdtemp(join(tmpdir(), "astro-search-"));
let chrome;
let socket;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = "http://127.0.0.1:" + server.address().port;
  chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
    "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
  ], { stdio: "ignore" });
  let launchError;
  chrome.on("error", (error) => { launchError = error; });
  let port = 0;
  for (let i = 0; i < 120; i++) {
    if (launchError) throw launchError;
    if (chrome.exitCode !== null) throw new Error("Chromium exited on startup");
    try {
      const active = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      port = Number(active.split("\n")[0]);
      if (port > 0) break;
    } catch { /* Chromium is still starting. */ }
    await sleep(100);
  }
  assert.ok(port, "Chromium DevTools failed to start");
  const opened = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" });
  assert.equal(opened.status, 200, "Unable to open browser target");
  const target = await opened.json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const promise = pending.get(message.id);
    if (!promise) return;
    pending.delete(message.id);
    if (message.error) promise.fail(new Error(JSON.stringify(message.error)));
    else promise.done(message.result);
  });
  const command = (method, params = {}) => new Promise((done, fail) => {
    const id = ++sequence;
    pending.set(id, { done, fail });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await command("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error("Browser JS exception: " + JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, check, label) => {
    for (let i = 0; i < 120; i++) {
      const value = await evaluate(expression);
      if (check(value)) return value;
      await sleep(100);
    }
    throw new Error("Timed out: " + label);
  };
  const navigate = async (page) => {
    await command("Page.navigate", { url: origin + page });
    const expected = JSON.stringify(new URL(page, origin).pathname);
    await waitFor("location.pathname === " + expected + " && document.readyState === 'complete'", Boolean, page);
  };
  await command("Page.enable");
  await command("Runtime.enable");

  await navigate("/?url=https%3A%2F%2F50watts.com%2F&title=50%20Watts");
  await waitFor(
    "document.querySelector('.new-bookmark .output code')?.textContent",
    (value) => typeof value === "string" && value.includes("Resource/50-watts.md"),
    "new bookmark Vue composer hydration",
  );
  await waitFor(
    "document.querySelector('.new-bookmark .duplicate')?.textContent",
    (value) => typeof value === "string" && value.includes("already appears"),
    "duplicate URL warning",
  );
  const githubHref = await evaluate(
    "document.querySelector('.new-bookmark .actions a')?.href",
  );
  assert.ok(githubHref.startsWith("https://github.com/Fooftilly/Fooftilly.github.io/new/master?"));
  const filename = new URL(githubHref).searchParams.get("filename");
  assert.equal(filename, "content/bookmarks/Resource/50-watts.md");
  await navigate("/?url=javascript%3Aalert(1)&title=Unsafe");
  await waitFor(
    "document.querySelector('.new-bookmark .validation')?.textContent",
    (value) => typeof value === "string" && value.includes("Only HTTP and HTTPS"),
    "unsafe URL rejected",
  );
  assert.equal(await evaluate("!!document.querySelector('.new-bookmark .output')"), false);
  const longUrl = "https://example.org/article?id=" + "x".repeat(2100);
  await navigate("/?title=Long%20URL&url=" + encodeURIComponent(longUrl));
  await waitFor(
    "document.querySelector('input[type=url]')?.value.length",
    (value) => value === longUrl.length,
    "captured long URL preserved without truncation",
  );
  await waitFor(
    "document.querySelector('.new-bookmark .validation')?.textContent",
    (value) => typeof value === "string" && value.includes("at most 2048"),
    "long URL rejected rather than silently truncated",
  );
  assert.equal(await evaluate("!!document.querySelector('.new-bookmark .output')"), false);

  await navigate("/?url=https%3A%2F%2Fexample.org%2F&title=Long%20Notes");
  await waitFor(
    "document.querySelector('.new-bookmark .output code')?.textContent",
    (value) => typeof value === "string" && value.includes("Resource/long-notes.md"),
    "composer ready for long note",
  );
  await evaluate("(()=>{const el=document.querySelector('textarea[placeholder=\"Longer personal notes\"]');el.value='a'.repeat(5000);el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor(
    "document.querySelector('.new-bookmark .actions a')?.href",
    (value) => value === "https://github.com/Fooftilly/Fooftilly.github.io/new/master",
    "long draft GitHub link fallback",
  );
  assert.equal(
    await evaluate("document.querySelector('.new-bookmark .actions button:nth-child(2)')?.textContent.trim()"),
    "Copy full file path",
  );
  assert.equal(
    await evaluate("document.querySelector('.new-bookmark .output code')?.textContent.trim()"),
    "content/bookmarks/Resource/long-notes.md",
  );
  console.log("Browser smoke: long URL not truncated, long draft safe full-path fallback passed");
  console.log("Browser smoke: bookmark composer URL prefill, duplicate warning, GitHub handoff and unsafe URL rejection passed");
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
