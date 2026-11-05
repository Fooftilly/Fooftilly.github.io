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
const profiles = [];
let chrome;
let socket;
try {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const origin = "http://127.0.0.1:" + server.address().port;
  let port = 0;
  let lastStartupError;
  // Retry browser *startup* once on a fresh profile. Never retry UI assertions:
  // an actual application failure must still fail the required browser smoke.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const profile = await mkdtemp(join(tmpdir(), "astro-search-"));
    profiles.push(profile);
    const chromeEnv = { ...process.env };
    // GitHub runners can expose a malformed desktop session bus address.
    // Headless Chrome needs no desktop session, and can otherwise stall here.
    delete chromeEnv.DBUS_SESSION_BUS_ADDRESS;
    chrome = spawn(process.env.CHROME_BIN || "google-chrome", [
      "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
      "--no-first-run", "--no-default-browser-check", "--remote-allow-origins=*",
      "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"], env: chromeEnv });
    let chromeStderr = "";
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
    let failureReason = "Chromium DevToolsActivePort was not created";
    for (let i = 0; i < 120; i++) {
      if (launchError) {
        failureReason = "Chromium spawn failed: " + launchError.message;
        break;
      }
      if (chrome.exitCode !== null || chrome.signalCode !== null) {
        failureReason = "Chromium exited before DevTools became available";
        break;
      }
      try {
        const active = await readFile(join(profile, "DevToolsActivePort"), "utf8");
        port = Number(active.split("\n")[0]);
        if (port > 0) break;
      } catch { /* Chromium is still starting. */ }
      await sleep(100);
    }
    if (port) break;
    lastStartupError = startupFailure(failureReason);
    if (!launchError && chrome.exitCode === null && chrome.signalCode === null) {
      // Fully stop a hung launch before using a new isolated user-data-dir.
      const exited = new Promise((done) => chrome.once("exit", done));
      chrome.kill("SIGKILL");
      await Promise.race([exited, sleep(1000)]);
    }
    if (attempt === 1) {
      console.warn("Chromium startup failed; retrying once with a fresh profile:\n" + lastStartupError.message);
    }
  }
  if (!port) throw lastStartupError;
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

  if (process.argv.includes("--media-fixtures")) {
    await navigate("/films/");
    await waitFor(
      "(()=>{const el=document.querySelector('.media-collection');const island=el?.closest('astro-island');const controls=el?.querySelector('[data-media-controls]');return Boolean(el && island && !island.hasAttribute('ssr') && controls && getComputedStyle(controls).display!=='none');})()",
      Boolean, "media Vue island hydrated with visible controls",
    );
    assert.equal(await evaluate("document.querySelectorAll('[data-media-row]').length"), 2);
    // A link labeled Jazz reviews is a reference, not a searchable media tag.
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='jazz';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === "0 of 2 entries", "unrelated link label excluded",
    );
    assert.equal(await evaluate("document.querySelectorAll('[data-media-row]').length"),0);
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='emilie';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === "1 of 2 entries", "accent-insensitive metadata search",
    );
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-media-sort=year]').click()})()");
    await waitFor(
      "document.querySelector('[data-media-row] th[scope=row]')?.textContent.includes('Zebra CI synthetic film')",
      Boolean, "newest film first",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-sort=year]')?.getAttribute('aria-pressed')"),"true");
    await evaluate("document.querySelector('[data-media-sort=rating]').click()");
    await waitFor(
      "document.querySelector('[data-media-row] th[scope=row]')?.textContent.includes('CI synthetic film (not for publication)')",
      Boolean, "highest rated film first",
    );
    console.log("Media fixture Chromium smoke: Vue hydration, search, live count and sort passed");
  } else {
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
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-analytics-consent]')).borderRadius"),"0px",
    "Cookie consent panel should use square corners");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.category-grid a')).borderRadius"),"0px",
    "Homepage cards should use square corners");
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
  assert.deepEqual(mobileConsent.actionOrder, ["Reject analytics", "Allow analytics"]);
  assert.ok(mobileConsent.left >= 0 && mobileConsent.right <= mobileConsent.viewportWidth + 1, "Mobile cookie notice must fit viewport width");
  assert.ok(mobileConsent.top >= 0 && mobileConsent.bottom <= mobileConsent.viewportHeight + 1, "Mobile cookie notice must fit viewport height");
  await command("Emulation.clearDeviceMetricsOverride");
  await evaluate("document.querySelector('[data-analytics-decline]').click()");
  console.log("Browser consent smoke: fixed desktop/mobile cookie overlay, settings reopening, keyboard focus and no eager Google tag passed");

  // Project cards are static links, not Vue islands. Reuse the existing Chrome
  // session to check real keyboard navigation and mobile geometry in both locales.
  for (const [route, language, sourceLabel, otherRoute] of [
    ["/projects/", "en", "Source code", "/sh/projects/"],
    ["/sh/projects/", "sh", "Izvorni kod", "/projects/"],
  ]) {
    await navigate(route);
    const desktop = await evaluate(
      "(()=>{const cards=[...document.querySelectorAll('.project-card')];" +
      "const label=" + JSON.stringify(sourceLabel) + ",other=" + JSON.stringify(otherRoute) + ";" +
      "return {language:document.documentElement.lang,cardCount:cards.length," +
      "alternate:[...document.querySelectorAll('a[hreflang]')].some(a=>a.getAttribute('href')===other)," +
      "directSources:cards.every(card=>{" +
      "const detail=card.querySelector('h3 a'),source=card.querySelector('.project-source a');" +
      "return detail?.getAttribute('href')?.startsWith('/projects/') &&" +
      "source?.href?.startsWith('https://github.com/Fooftilly/') &&" +
      "source.textContent.trim()===label &&" +
      "source.getAttribute('aria-label')===label+': '+detail.textContent.trim() &&" +
      "source.getBoundingClientRect().width>0;" +
      "})};})()",
    );
    assert.equal(desktop.language, language, "Project index must declare the correct language: " + route);
    assert.ok(desktop.cardCount >= 3, "Project showcase must contain all initial cards: " + route);
    assert.equal(desktop.alternate, true, "Project index language switch is missing: " + route);
    assert.equal(desktop.directSources, true, "Project card source links must be visible and localized: " + route);

    // Start on the detail link, then send a genuine keyboard Tab via DevTools.
    // The source link should be the next focusable control within the card.
    await evaluate("document.querySelector('.project-card h3 a').focus()");
    assert.equal(await evaluate("document.activeElement === document.querySelector('.project-card h3 a')"), true);
    await command("Input.dispatchKeyEvent", {
      type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
    });
    await command("Input.dispatchKeyEvent", {
      type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9,
    });
    assert.equal(
      await evaluate("document.activeElement === document.querySelector('.project-card .project-source a')"),
      true, "Tab from a project detail link must focus that project's source link: " + route,
    );

    await command("Emulation.setDeviceMetricsOverride", {
      width: 375, height: 667, deviceScaleFactor: 1, mobile: true,
    });
    const mobileCards = await evaluate(
      "(()=>{const cards=[...document.querySelectorAll('.project-card')];" +
      "return {width:innerWidth,documentWidth:document.documentElement.scrollWidth," +
      "cardsFit:cards.every(card=>{" +
      "const rect=card.getBoundingClientRect()," +
      "source=card.querySelector('.project-source a')?.getBoundingClientRect();" +
      "return rect.width>0 && rect.left>=-1 && rect.right<=innerWidth+1 &&" +
      "source?.width>0 && source.left>=-1 && source.right<=innerWidth+1;" +
      "})};})()",
    );
    assert.equal(mobileCards.width, 375, "Mobile viewport emulation must be active: " + route);
    assert.ok(mobileCards.documentWidth <= 376, "Project index must not overflow horizontally: " + route);
    assert.equal(mobileCards.cardsFit, true, "Project cards and source links must fit mobile viewport: " + route);
    await command("Emulation.clearDeviceMetricsOverride");
  }
  console.log("Browser project smoke: EN/SH direct-source links, keyboard Tab order and mobile layout passed");

  await navigate("/sh/search/");
  // The SSR input is already present before Vue attaches event handlers.
  // Only interact after Astro marks this island as fully hydrated.
  await waitFor(
    "(()=>{const browser=document.querySelector('.bookmark-browser');const island=browser?.closest('astro-island');return Boolean(browser && island && !island.hasAttribute('ssr') && browser.querySelector('input[type=search]'));})()",
    Boolean, "Serbo-Croatian bookmark search Vue hydration",
  );
  await waitFor(
    "document.querySelector('input[type=search]')?.placeholder",
    (value) => value === "Naziv, kategorija ili adresa",
    "Serbo-Croatian Vue search controls",
  );
  const options = await evaluate(
    "Array.from(document.querySelectorAll('[data-bookmark-category]')).map(o=>({label:o.textContent.trim(),value:o.dataset.bookmarkCategory,pressed:o.getAttribute('aria-pressed')}))",
  );
  assert.ok(options.some((o) => o.label === "Članci i knjige" && o.value === "Articles & books"));
  assert.ok(options.some((o) => o.label === "Resursi" && o.value === "Resources"));
  assert.equal(await evaluate("document.querySelectorAll('.bookmark-browser select').length"), 0,
    "Bookmark category and sort controls must use visible buttons, not dropdowns");
  assert.equal(await evaluate("document.querySelectorAll('[data-bookmark-category][aria-pressed=true]').length"), 1);
  assert.equal(await evaluate("document.querySelectorAll('[data-bookmark-sort][aria-pressed=true]').length"), 1);
  assert.equal(await evaluate("document.querySelector('[data-bookmark-category=all]')?.getAttribute('aria-pressed')"), "true");

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
    "Nema rezultata.",
  );

  await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));const category=[...document.querySelectorAll('[data-bookmark-category]')].find(button=>button.dataset.bookmarkCategory==='Articles & books');category.click()})()");
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
    (value) => value === "Članci i knjige", "Serbo-Croatian bookmark result metadata",
  );
  await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value='Članci i knjige';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor(
    "new URL(location.href).searchParams.get('q')",
    (value) => value === "Članci i knjige", "Serbo-Croatian category search URL state",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 20, "Serbo-Croatian category label matches bookmarks",
  );
  await command("Page.reload", { ignoreCache: true });
  await waitFor(
    "document.querySelector('[data-bookmark-category][aria-pressed=true]')?.dataset.bookmarkCategory",
    (value) => value === "Articles & books", "category restored after reload",
  );
  await waitFor(
    "document.querySelectorAll('li.bookmark-entry').length",
    (value) => value === 20, "reloaded filtered results",
  );
  await evaluate("document.querySelector('[data-bookmark-sort=title]').click()");
  await waitFor(
    "new URL(location.href).searchParams.get('sort')",
    (value) => value === "title", "sort button URL state",
  );
  assert.equal(await evaluate("document.querySelector('[data-bookmark-sort=title]').getAttribute('aria-pressed')"), "true");
  assert.equal(await evaluate("document.querySelectorAll('[data-bookmark-sort][aria-pressed=true]').length"), 1);
  await evaluate("document.querySelector('[data-bookmark-sort=newest]').click()");
  await waitFor(
    "new URL(location.href).searchParams.has('sort')",
    (value) => value === false, "default sort removes URL parameter",
  );

  await command("Emulation.setDeviceMetricsOverride", {
    width: 375, height: 667, deviceScaleFactor: 1, mobile: true,
  });
  const mobileFilters = await evaluate(
    "(()=>{const buttons=[...document.querySelectorAll('.bookmark-controls button')];" +
    "return {width:document.documentElement.scrollWidth,viewport:innerWidth," +
    "buttonsFit:buttons.every(button=>{const box=button.getBoundingClientRect();" +
    "return box.width>0&&box.left>=-1&&box.right<=innerWidth+1;})};})()",
  );
  assert.ok(mobileFilters.width <= mobileFilters.viewport + 1, "Bookmark controls must not overflow mobile viewport");
  assert.equal(mobileFilters.buttonsFit, true, "All category and sort buttons must fit the mobile viewport");
  await command("Emulation.clearDeviceMetricsOverride");

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
  assert.equal(await evaluate("document.querySelectorAll('.media-editor select').length"),0,
    "Media type and status must be visible button groups, not dropdowns");
  assert.equal(await evaluate("document.querySelector('[data-media-kind=films]')?.getAttribute('aria-pressed')"),"true");
  assert.equal(await evaluate("document.querySelector('[data-media-status]')?.getAttribute('aria-pressed')"),"true");
  assert.equal(await evaluate("document.querySelector('[data-media-rating]')?.getAttribute('step')"),"0.5");
  assert.equal(await evaluate("document.querySelector('[data-media-rating]')?.getAttribute('aria-valuetext')"),"Not rated");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.media-editor input[placeholder=Title]')).borderRadius"),"0px");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-media-kind=films]')).borderRadius"),"0px");
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
  assert.equal(await evaluate("document.querySelector('[data-media-rating]')?.getAttribute('aria-valuetext')"),"4.5 out of 5 stars");
  assert.equal(await evaluate("document.querySelector('.rating-value')?.textContent.trim()"),"4.5 / 5");
  await evaluate("document.querySelector('[data-media-status=planned]').click()");
  await waitFor(
    "(()=>{const json=document.querySelector('.media-editor .preview textarea[readonly]')?.value;return json?JSON.parse(json).status:undefined})()",
    value=>value==="planned","status button updates drafted record",
  );
  assert.equal(await evaluate("document.querySelector('[data-media-status=planned]')?.getAttribute('aria-pressed')"),"true");
  await evaluate("document.querySelector('[data-media-status]').click()");
  await waitFor(
    "(()=>{const json=document.querySelector('.media-editor .preview textarea[readonly]')?.value;return json?JSON.parse(json).status===undefined:false})()",
    Boolean,"clearing status removes optional metadata",
  );
  await evaluate("(()=>{const el=document.querySelector('[data-media-rating]');el.stepUp();el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor("document.querySelector('.rating-value')?.textContent.trim()",
    value=>value==="5.0 / 5","native half-star slider step reaches five stars");
  assert.equal(await evaluate("JSON.parse(document.querySelector('.media-editor .preview textarea[readonly]').value).rating"),5);
  await evaluate("document.querySelector('.clear-rating').click()");
  await waitFor(
    "(()=>{const json=document.querySelector('.media-editor .preview textarea[readonly]')?.value;return json?JSON.parse(json).rating===undefined:false})()",
    Boolean,"clear rating omits the optional field",
  );
  assert.equal(await evaluate("document.querySelector('.rating-value')?.textContent.trim()"),"Not rated");
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

  // Each media category must take the maintainer to the correct draft kind.
  // The kind is selected after hydration, never blindly trusted from the URL.
  for (const kind of ["music", "tv", "films"]) {
    await navigate("/" + kind + "/");
    const addHref = await evaluate(
      "document.querySelector('a[href=\"/new-media/?kind=" + kind + "\"]')?.getAttribute('href')"
    );
    assert.equal(addHref, "/new-media/?kind=" + kind);
    await navigate("/new-media/?kind=" + kind);
    await waitFor(
      "(()=>{const el=document.querySelector('.media-editor');const island=el?.closest('astro-island');return Boolean(el && island && !island.hasAttribute('ssr'));})()",
      Boolean, "media draft hydration for " + kind,
    );
    await waitFor(
      "document.querySelector('[data-media-kind=" + kind + "]')?.getAttribute('aria-pressed')",
      (value) => value === "true", "media category button preselected for " + kind,
    );
    await evaluate("(()=>{const el=document.querySelector('.media-editor input[type=text]');el.value='A New Entry';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "document.querySelector('.media-editor .preview code')?.textContent",
      (value) => typeof value === "string" && value.startsWith("content/media/" + kind + "/"),
      "generated file path follows the selected category " + kind,
    );
    const json = await evaluate(
      "document.querySelector('.media-editor .preview textarea[readonly]')?.value",
    );
    assert.equal(JSON.parse(json).kind, kind);
  }
  await navigate("/new-media/?kind=untrusted");
  await waitFor(
    "(()=>{const el=document.querySelector('.media-editor');const island=el?.closest('astro-island');return Boolean(el && island && !island.hasAttribute('ssr'));})()",
    Boolean, "media form hydration for invalid category",
  );
  assert.equal(
    await evaluate("document.querySelector('[data-media-kind=films]')?.getAttribute('aria-pressed')"),
    "true",
    "Unexpected URL parameters must not change the media category",
  );

  console.log("Browser media smoke: first-party draft, GitHub PR handoff and unsafe-URL rejection passed");

  console.log("Browser smoke: long URL not truncated, long draft safe full-path fallback passed");
  console.log("Browser smoke: bookmark composer URL prefill, duplicate warning, GitHub handoff and unsafe URL rejection passed");
  console.log("Browser search smoke: Serbo-Croatian labels, Vue input, category filter, URL state, reload and English search passed");
  }
} finally {
  socket?.close();
  if (chrome && chrome.exitCode === null) chrome.kill();
  await new Promise((done) => server.close(done));
  await Promise.all(profiles.map((profile) => rm(profile, { recursive: true, force: true, maxRetries: 3 })));
}
