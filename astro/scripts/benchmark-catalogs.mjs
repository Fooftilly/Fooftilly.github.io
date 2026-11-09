#!/usr/bin/env node
/** Local-only reproducible performance probe of already built Astro catalog pages.
 * Run after npm run build. Measurements are NOT live CDN/network field data.
 * No publishing, third-party service requests or Git-managed content writes.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { brotliCompressSync, constants } from "node:zlib";
import { chromiumPageWebSocketUrl } from "./chromium-devtools-target.mjs";
import { CATALOG_ROUTES, measureStaticPage, median } from "./catalog-performance.mjs";

const sleep = ms => new Promise(done => setTimeout(done, ms));
const dist = resolve("dist");
const maxWait = 20000;
const viewports = [
  { name: "desktop", width: 1365, height: 768, scale: 1, mobile: false },
  { name: "mobile", width: 390, height: 844, scale: 2, mobile: true },
];
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".xml": "application/xml",
  ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".jpg": "image/jpeg",
};
const iterationsArg = process.argv.indexOf("--iterations");
let iterations = 2;
if (process.argv.includes("--help")) {
  console.log("After npm run build: node scripts/benchmark-catalogs.mjs [--iterations 1..5]\n" +
    "Produces ignored .audit/catalog-performance.json; no live CDN requests or publishing.");
  process.exit(0);
}
if (iterationsArg !== -1) {
  const text = process.argv[iterationsArg + 1];
  if (!/^[1-5]$/.test(text ?? "")) throw new Error("--iterations must be 1..5");
  iterations = Number(text);
}
if (process.argv.some((arg, i) => i > 1 && arg.startsWith("--") &&
  arg !== "--iterations")) throw new Error("Unknown argument");
const sourcePages = await Promise.all(CATALOG_ROUTES.map(async route => ({
  ...route,
  html: await readFile(join(dist, route.path.slice(1), "index.html"), "utf8"),
})));
const staticMetrics = Object.fromEntries(sourcePages.map(({ path, kind, html }) =>
  [path, measureStaticPage(html, kind)]));
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    let path = resolve(dist, "." + pathname);
    if (path !== dist && !path.startsWith(dist + sep)) throw new Error("Unsafe path");
    if (pathname.endsWith("/") || !extname(path)) path = join(path, "index.html");
    const body = await readFile(path);
    const type = mime[extname(path)] ?? "application/octet-stream";
    const compress = /(?:text\/|javascript|json|svg\+xml)/.test(type) &&
      /\bbr\b/.test(String(req.headers["accept-encoding"] ?? ""));
    const encoded = compress ? brotliCompressSync(body, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }) : body;
    res.writeHead(200, {
      "Content-Type": type, "Content-Length": encoded.length,
      "Cache-Control": "no-store",
      ...(compress ? { "Content-Encoding": "br" } : {}),
    });
    res.end(encoded);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});
let chrome;
let socket;
let profile;
try {
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const origin = "http://127.0.0.1:" + server.address().port;
  profile = await mkdtemp(join(tmpdir(), "peroniko-benchmark-"));
  const chromeEnv = { ...process.env };
  delete chromeEnv.DBUS_SESSION_BUS_ADDRESS;
  chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
    "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--no-first-run", "--no-default-browser-check", "--remote-debugging-address=127.0.0.1",
    "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], env: chromeEnv });
  let chromeError = "";
  chrome.stderr.on("data", chunk => {
    chromeError = (chromeError + chunk.toString()).slice(-4000);
  });
  let spawnError;
  chrome.on("error", error => { spawnError = error; });
  let port;
  for (let i = 0; i < 120; i++) {
    if (spawnError || chrome.exitCode !== null || chrome.signalCode !== null) break;
    try {
      const active = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      port = Number(active.split("\n")[0]);
      if (port) break;
    } catch { /* Await startup. */ }
    await sleep(100);
  }
  if (!port) throw new Error("Chromium startup failed: " + (spawnError?.message ?? chromeError));
  const targetResponse = await fetch("http://127.0.0.1:" + port + "/json/new?about:blank", { method: "PUT" });
  assert.equal(targetResponse.status, 200);
  const target = await targetResponse.json();
  const debuggerUrl = chromiumPageWebSocketUrl(target.webSocketDebuggerUrl, port, target.id);
  socket = new WebSocket(debuggerUrl);
  await new Promise((done, fail) => {
    socket.addEventListener("open", done, { once: true });
    socket.addEventListener("error", fail, { once: true });
  });
  let sequence = 0;
  let transferred = 0;
  let requests = new Set();
  let offOrigin = new Set();
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Network.requestWillBeSent") {
      const url = message.params?.request?.url;
      if (url?.startsWith(origin + "/")) requests.add(message.params.requestId);
      else if (/^https?:\/\//.test(url ?? "")) offOrigin.add(new URL(url).origin);
    }
    if (message.method === "Network.loadingFinished" && requests.has(message.params.requestId)) {
      transferred += message.params.encodedDataLength ?? 0;
      requests.delete(message.params.requestId);
    }
    const wait = pending.get(message.id);
    if (wait) {
      pending.delete(message.id);
      if (message.error) wait.fail(new Error(JSON.stringify(message.error)));
      else wait.done(message.result);
    }
  });
  const command = (method, params = {}) => new Promise((done, fail) => {
    const id = ++sequence;
    pending.set(id, { done, fail });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await command("Runtime.evaluate", {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor = async (expression, condition, label) => {
    const started = Date.now();
    while (Date.now() - started < maxWait) {
      const value = await evaluate(expression);
      if (condition(value)) return value;
      await sleep(50);
    }
    throw new Error("Timed out: " + label);
  };
  await command("Page.enable");
  await command("Runtime.enable");
  await command("Network.enable");
  await command("Network.setCacheDisabled", { cacheDisabled: true });
  await command("Performance.enable");
  await command("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__benchmarkLcp=null;try{new PerformanceObserver(list=>{" +
      "for(const entry of list.getEntries())window.__benchmarkLcp=entry.startTime;" +
      "}).observe({type:'largest-contentful-paint',buffered:true});}catch{}",
  });
  const samples = [];
  for (const viewport of viewports) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: viewport.scale,
      mobile: viewport.mobile,
    });
    for (const route of CATALOG_ROUTES) {
      for (let run = 0; run < iterations; run++) {
        // A blank interstitial prevents a repeated same-path navigation from
        // accidentally sampling the preceding document before it reloads.
        await command("Page.navigate", { url: "about:blank" });
        await waitFor("location.href==='about:blank'&&document.readyState==='complete'", Boolean, "blank interstitial");
        transferred = 0;
        requests = new Set();
        offOrigin = new Set();
        await command("Page.navigate", { url: origin + route.path });
        await waitFor("location.pathname===" + JSON.stringify(route.path) +
          "&&document.readyState==='complete'", Boolean, "load " + route.path);
        const root = route.kind === "media" ? ".media-collection" : ".bookmark-browser";
        await waitFor("Boolean(document.querySelector(" + JSON.stringify(root) +
          ")?.closest('astro-island:not([ssr])'))", Boolean, "Vue hydration " + route.path);
        const hydratedAt = await evaluate("performance.now()");
        await sleep(150);
        const state = await evaluate("(()=>{const nav=performance.getEntriesByType('navigation')[0];" +
          "return {ttfb_ms:nav?.responseStart??null,load_ms:nav?.loadEventEnd??null," +
          "hydration_observed_ms:null,lcp_ms:window.__benchmarkLcp??null," +
          "hydrated_rows:document.querySelectorAll(" +
          JSON.stringify(route.kind === "media" ? "[data-media-row]" : "li.bookmark-entry") +
          ").length};})()");
        state.hydration_observed_ms = hydratedAt;
        const metrics = (await command("Performance.getMetrics")).metrics;
        const metric = name => metrics.find(x => x.name === name)?.value ?? null;
        const selector = route.kind === "media" ? ".media-collection input[data-media-search]" :
          ".bookmark-browser input[type=search]";
        let searchSettle = null;
        if (state.hydrated_rows > 0) {
          await evaluate("(()=>{const el=document.querySelector(" + JSON.stringify(selector) +
            ");if(!el)throw new Error('Search input missing');window.__benchmarkStart=performance.now();" +
            "el.value='zz-peroniko-benchmark-never-matches';" +
            "el.dispatchEvent(new Event('input',{bubbles:true}));})()");
          await waitFor("document.querySelectorAll(" +
            JSON.stringify(route.kind === "media" ? "[data-media-row]" : "li.bookmark-entry") +
            ").length===0", Boolean, "search input response " + route.path);
          searchSettle = await evaluate("performance.now()-window.__benchmarkStart");
        }
        if (offOrigin.size) throw new Error("Unexpected cross-origin request: " + [...offOrigin].join(", "));
        samples.push({
          route: route.path, viewport: viewport.name, iteration: run + 1,
          ...state,
          js_heap_used_bytes: metric("JSHeapUsedSize"), dom_nodes: metric("Nodes"),
          search_settle_observed_ms: searchSettle, local_encoded_transfer_bytes: transferred,
        });
      }
    }
  }
  const output = {
    schema: 1, generated_at: new Date().toISOString(), mode: "local-build-controlled",
    environment: {
      node: process.version, chromium: process.env.CHROME_BIN || "google-chrome",
      iterations, network: "loopback; Brotli quality 5 for text; browser cache disabled",
      note: "No live CDN TTFB, real-user INP, field LCP or full-process RSS. Browser input settle includes polling overhead.",
    },
    static: staticMetrics, samples,
  };
  await mkdir(".audit", { recursive: true });
  await writeFile(".audit/catalog-performance.json", JSON.stringify(output, null, 2) + "\n", { mode: 0o600 });
  const summary = [
    "### Catalog performance — controlled local baseline",
    "",
    "| Route | Viewport | HTML raw / Brotli KiB | SSR / hydrated rows | Median TTFB ms | Median LCP ms | Median observed filter settle ms | Median JS heap MiB |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const route of CATALOG_ROUTES) {
    for (const viewport of viewports) {
      const observed = samples.filter(x => x.route === route.path && x.viewport === viewport.name);
      const mid = key => {
        const values = observed.map(x => x[key]).filter(Number.isFinite);
        return values.length ? median(values).toFixed(1) : "n/a";
      };
      const stat = staticMetrics[route.path];
      summary.push("| " + route.path + " | " + viewport.name + " | " +
        (stat.html_bytes / 1024).toFixed(0) + " / " + (stat.html_brotli_bytes / 1024).toFixed(0) +
        " | " + stat.ssr_rows + " / " + mid("hydrated_rows") + " | " +
        mid("ttfb_ms") + " | " + mid("lcp_ms") + " | " +
        mid("search_settle_observed_ms") + " | " +
        (observed.some(x => Number.isFinite(x.js_heap_used_bytes)) ?
          (median(observed.map(x => x.js_heap_used_bytes).filter(Number.isFinite)) / 1048576).toFixed(1) : "n/a") + " |");
    }
  }
  summary.push("", "Local headless Chromium measurements on a loopback preview; not production RUM, CDN delivery or true INP.", "");
  console.log(summary.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summary.join("\n") + "\n");
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
  await new Promise(done => server.close(done));
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 2 });
}
