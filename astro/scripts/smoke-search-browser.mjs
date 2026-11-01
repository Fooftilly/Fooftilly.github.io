/** End-to-end smoke test: rendered Astro and hydrated Vue search in real Chrome.
 * Node 24 WebSocket + Chromium DevTools avoid adding browser npm dependencies.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const dist = resolve("dist");
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

  await navigate("/sr/search/");
  await waitFor(
    "document.querySelector('input[type=search]')?.placeholder",
    (value) => value === "Naziv, kategorija ili veb-adresa",
    "Serbian Vue search controls",
  );
  const options = await evaluate(
    "Array.from(document.querySelector('select').options).map(o=>({label:o.textContent.trim(),value:o.value}))",
  );
  assert.ok(options.some((o) => o.label === "Članci i knjige" && o.value === "Articles & books"));
  assert.ok(options.some((o) => o.label === "Resursi" && o.value === "Resources"));

  await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value='no-matching-bookmark-2026';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor(
    "new URL(location.href).searchParams.get('q')",
    (value) => value === "no-matching-bookmark-2026", "search URL state",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 0, "empty filtered results",
  );
  assert.equal(
    await evaluate("document.querySelector('.empty-result')?.textContent.trim()"),
    "Nema linkova koji odgovaraju filterima.",
  );

  await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));const select=document.querySelector('select');select.value='Articles & books';select.dispatchEvent(new Event('change',{bubbles:true}))})()");
  await waitFor(
    "new URL(location.href).searchParams.get('category')",
    (value) => value === "Articles & books", "category query parameter",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 20, "20 article/book bookmarks",
  );
  await command("Page.reload", { ignoreCache: true });
  await waitFor(
    "document.querySelector('select')?.value",
    (value) => value === "Articles & books", "category restored after reload",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 20, "reloaded filtered results",
  );

  await navigate("/search/?q=50%20Watts");
  await waitFor(
    "document.querySelector('input[type=search]')?.value",
    (value) => value === "50 Watts", "English query URL state",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 1, "English exact search",
  );
  console.log("Browser search smoke: Serbian labels, Vue input, category filter, URL state, reload and English search passed");
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
