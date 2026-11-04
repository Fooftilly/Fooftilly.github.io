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
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let chromeStderr = "";
  // Keep a bounded tail of diagnostics without flooding Actions logs.
  chrome.stderr?.on("data", (chunk) => {
    chromeStderr = (chromeStderr + chunk.toString("utf8")).slice(-8192);
  });
  const startupFailure = (reason) => {
    const exit = chrome.exitCode !== null ? `exit code ${chrome.exitCode}`
      : chrome.signalCode !== null ? `signal ${chrome.signalCode}` : "process still running";
    return new Error(`${reason} (${exit})\nChrome stderr:\n${chromeStderr.trim() || "(none captured)"}`);
  };
  let launchError;
  chrome.on("error", (error) => { launchError = error; });
  let port = 0;
  for (let i = 0; i < 120; i++) {
    if (launchError) throw startupFailure(`Chromium spawn failed: ${launchError.message}`);
    if (chrome.exitCode !== null || chrome.signalCode !== null) {
      throw startupFailure("Chromium exited before DevTools became available");
    }
    try {
      const active = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      port = Number(active.split("\n")[0]);
      if (port > 0) break;
    } catch { /* Chromium is still starting. */ }
    await sleep(100);
  }
  if (!port) throw startupFailure("Chromium DevToolsActivePort was not created");
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

  // Consent must appear as a fixed cookie overlay, not as an inline footer.
  await navigate("/");
  await waitFor(
    "document.querySelector('[data-analytics-consent]')?.hidden === false",
    Boolean, "first-visit cookie banner",
  );
  const desktopConsent = await evaluate(`(()=>{
    const el=document.querySelector('[data-analytics-consent]');
    const rect=el.getBoundingClientRect();
    return {
      position:getComputedStyle(el).position,
      left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
      viewportWidth:innerWidth, viewportHeight:innerHeight,
      settings:!!document.querySelector('[data-analytics-settings]'),
      focused:document.activeElement===el,
      gaLoaded:!!document.querySelector('[data-ga-loader]'),
    };
  })()`);
  assert.equal(desktopConsent.position, "fixed");
  assert.equal(desktopConsent.settings, true);
  assert.equal(desktopConsent.focused, true, "Cookie banner should be discoverable to keyboard users");
  assert.equal(desktopConsent.gaLoaded, false, "No Google tag without opt-in");
  assert.ok(desktopConsent.left >= 0 && desktopConsent.right <= desktopConsent.viewportWidth + 1);
  assert.ok(desktopConsent.top >= 0 && desktopConsent.bottom <= desktopConsent.viewportHeight + 1);
  await evaluate("document.querySelector('[data-analytics-decline]').click()");
  assert.equal(await evaluate("document.querySelector('[data-analytics-consent]').hidden"), true);
  await evaluate("document.querySelector('[data-analytics-settings]').click()");
  assert.equal(await evaluate("document.querySelector('[data-analytics-consent]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-analytics-settings]').getAttribute('aria-expanded')"), "true");

  // Mobile-sized windows keep the cookie notice inside the viewport.
  await command("Emulation.setDeviceMetricsOverride", {
    width: 375, height: 667, deviceScaleFactor: 1, mobile: true,
  });
  const mobileConsent = await evaluate(`(()=>{
    const el=document.querySelector('[data-analytics-consent]');
    const rect=el.getBoundingClientRect();
    return {
      left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
      viewportWidth:innerWidth, viewportHeight:innerHeight,
      position:getComputedStyle(el).position,
      actionDirection:getComputedStyle(document.querySelector('.consent-actions')).flexDirection,
      actionOrder:Array.from(document.querySelectorAll('.consent-actions button')).map(button=>button.textContent.trim()),
    };
  })()`);
  assert.equal(mobileConsent.position, "fixed");
  assert.equal(mobileConsent.actionDirection, "column", "Visual and keyboard order must agree on narrow screens");
  assert.deepEqual(mobileConsent.actionOrder, ["Reject optional cookies", "Allow analytics"]);
  assert.ok(mobileConsent.left >= 0 && mobileConsent.right <= mobileConsent.viewportWidth + 1, "Mobile cookie notice must fit viewport width");
  assert.ok(mobileConsent.top >= 0 && mobileConsent.bottom <= mobileConsent.viewportHeight + 1, "Mobile cookie notice must fit viewport height");
  await command("Emulation.clearDeviceMetricsOverride");
  await evaluate("document.querySelector('[data-analytics-decline]').click()");
  console.log("Browser consent smoke: fixed desktop/mobile cookie overlay, settings reopening, keyboard focus and no eager Google tag passed");

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
  await waitFor(
    "document.querySelector('li.bookmark-entry .metadata span')?.textContent",
    (value) => value === "Članci i knjige", "Serbian bookmark result metadata",
  );
  await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value='Članci i knjige';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor(
    "new URL(location.href).searchParams.get('q')",
    (value) => value === "Članci i knjige", "Serbian category search URL state",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 20, "Serbian category label matches bookmarks",
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
  await navigate("/new-bookmark/?url=https%3A%2F%2F50watts.com%2F&title=50%20Watts");
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
  await navigate("/new-bookmark/?url=javascript%3Aalert(1)&title=Unsafe");
  await waitFor(
    "document.querySelector('.new-bookmark .validation')?.textContent",
    (value) => typeof value === "string" && value.includes("Only HTTP and HTTPS"),
    "unsafe URL rejected",
  );
  assert.equal(await evaluate("!!document.querySelector('.new-bookmark .output')"), false);
  const longUrl = "https://example.org/article?id=" + "x".repeat(2100);
  await navigate("/new-bookmark/?title=Long%20URL&url=" + encodeURIComponent(longUrl));
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

  await navigate("/new-bookmark/?url=https%3A%2F%2Fexample.org%2F&title=Long%20Notes");
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
  await navigate("/new-media/");
  await waitFor(
    "(()=>{const editor=document.querySelector('.media-editor');const island=editor?.closest('astro-island');return Boolean(editor && island && !island.hasAttribute('ssr') && editor.querySelector('input[placeholder=\\\"Title\\\"]'));})()",
    Boolean, "new media Vue component hydration completed",
  );
  await evaluate(`(()=>{
    const edit=(selector,value,event="input")=>{
      const el=document.querySelector(selector);
      el.value=value;
      el.dispatchEvent(new Event(event,{bubbles:true}));
    };
    edit('.media-editor input[placeholder="Title"]',"A Test Film");
    edit('.media-editor input[step="1"]',"2024");
    edit('.media-editor input[step="0.5"]',"4.5");
    edit('.media-editor input[placeholder="https://..."]',"https://letterboxd.com/film/test/");
  })()`);
  await waitFor(
    "document.querySelector('.media-editor .preview code')?.textContent",
    (value) => typeof value === "string" && value.includes("content/media/films/a-test-film-2024.json"),
    "media form generated first-party Git JSON",
  );
  const mediaDraft = await evaluate(
    "document.querySelector('.media-editor .preview textarea[readonly]')?.value",
  );
  const parsedMedia = JSON.parse(mediaDraft);
  assert.deepEqual(
    {schema:parsedMedia.schema,kind:parsedMedia.kind,title:parsedMedia.title,year:parsedMedia.year,rating:parsedMedia.rating},
    {schema:1,kind:"films",title:"A Test Film",year:2024,rating:4.5},
  );
  assert.equal(parsedMedia.links[0].url, "https://letterboxd.com/film/test/");
  const mediaHref = await evaluate(
    "document.querySelector('.media-editor .actions a')?.href",
  );
  assert.ok(mediaHref?.startsWith("https://github.com/Fooftilly/Fooftilly.github.io/new/master?"));
  assert.equal(new URL(mediaHref).searchParams.get("filename"), "content/media/films/a-test-film-2024.json");
  await evaluate(`(()=>{
    const el=document.querySelector('.media-editor input[placeholder="https://..."]');
    el.value="javascript:alert(1)";
    el.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  await waitFor(
    "document.querySelector('.media-editor .error')?.textContent",
    (value) => typeof value === "string" && value.includes("Only absolute HTTP/HTTPS"),
    "media form rejects unsafe URLs",
  );
  assert.equal(await evaluate("document.querySelector('.media-editor .preview')"), null);
  console.log("Browser media smoke: first-party draft, GitHub PR handoff and unsafe-URL rejection passed");

  console.log("Browser smoke: long URL not truncated, long draft safe full-path fallback passed");
  console.log("Browser smoke: bookmark composer URL prefill, duplicate warning, GitHub handoff and unsafe URL rejection passed");
  console.log("Browser search smoke: Serbian labels, Vue input, category filter, URL state, reload and English search passed");
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  await new Promise((done) => server.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
