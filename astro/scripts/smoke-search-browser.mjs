/** End-to-end smoke test: rendered Astro and hydrated Vue search in real Chrome.
 * Node 24 WebSocket + Chromium DevTools avoid adding browser npm dependencies.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
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
  const bookmarkCategories = JSON.parse(await readFile(resolve("src/data/bookmark-categories.json"), "utf8"));
  const bookmarkRecords = JSON.parse(await readFile(resolve(".audit/bookmarks-parity.json"), "utf8"));
  const defaultCategory = bookmarkCategories.find(item => item.default);
  assert.ok(defaultCategory, "Missing configured default bookmark category");
  const categoryCount = category => bookmarkRecords.filter(record => record.id.startsWith(category.section + "/")).length;
  const categoryForDetails = bookmarkCategories.find(category => categoryCount(category) >= 2)
    ?? bookmarkCategories.find(category => categoryCount(category) > 0);
  const categoryForSearch = bookmarkCategories.find(category => categoryCount(category) > 0 && category.labelSh !== category.label)
    ?? bookmarkCategories.find(category => categoryCount(category) > 0);
  const activeCategories = bookmarkCategories.filter(category => categoryCount(category) > 0);
  const sourceProjects = (await readdir(resolve("../content/projects")))
    .filter(name => name.endsWith(".md")).map(name => name.slice(0, -3));
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
    // Synthetic records coexist with any real Git-owned media JSON files.
    const mediaSource = Object.fromEntries(await Promise.all(
      ["films", "music", "tv"].map(async kind => {
        const filenames = (await readdir(resolve("../content/media", kind)))
          .filter(name => name.endsWith(".json"));
        const entries = await Promise.all(filenames.map(async name =>
          JSON.parse(await readFile(resolve("../content/media", kind, name), "utf8"))));
        return [kind, entries];
      }),
    ));
    const foldMedia = value => String(value ?? "").normalize("NFKD")
      .replace(/\p{M}/gu, "").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
    const mediaMatchesQuery = (item, query) => {
      const status = item.status === "in-progress" ? "in-progress In progress" : item.status ?? "";
      const haystack = foldMedia([item.title, item.creator, item.year, status, item.notes].join(" "));
      return foldMedia(query).split(" ").filter(Boolean).every(term => haystack.includes(term));
    };
    const mediaCount = (kind, query = "", status = "all") => mediaSource[kind]
      .filter(item => mediaMatchesQuery(item, query) &&
        (status === "all" || (status === "unspecified" ? !item.status : item.status === status))).length;
    const mediaCountLabel = (kind, query = "", status = "all") =>
      mediaCount(kind, query, status) + " of " + mediaSource[kind].length + " entries";
    const firstFilmTitle = "CI synthetic film (not for publication)";
    const secondFilmTitle = "Zebra CI synthetic film";
    assert.ok(mediaSource.films.some(item => item.title === firstFilmTitle));
    assert.ok(mediaSource.films.some(item => item.title === secondFilmTitle));
    await navigate("/films/");
    await waitFor(
      "(()=>{const el=document.querySelector('.media-collection');const island=el?.closest('astro-island');const controls=el?.querySelector('[data-media-controls]');return Boolean(el && island && !island.hasAttribute('ssr') && controls && getComputedStyle(controls).display!=='none');})()",
      Boolean, "media Vue island hydrated with visible controls",
    );
    assert.equal(await evaluate("document.querySelectorAll('[data-media-row]').length"), mediaSource.films.length);
    // A link labeled Jazz reviews is a reference, not a searchable media tag.
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='jazz';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "jazz", "all"), "unrelated link label excluded",
    );
    assert.equal(await evaluate("document.querySelectorAll('[data-media-row]').length"), mediaCount("films", "jazz"));
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-media-row] th[scope=row]')).some(th=>th.textContent.includes('CI synthetic film (not for publication)'))"), false,
      "A link-label-only query must not match the disposable film");
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='emilie';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "emilie", "all"), "accent-insensitive metadata search",
    );
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-media-row]')).find(row=>row.querySelector('th[scope=row]')?.textContent.includes('CI synthetic film (not for publication)'))?.querySelector('details')?.open"), false,
      "A visible creator match does not unnecessarily reveal public notes");
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='second';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "second", "all"), "note-only search finds the correct film",
    );
    await waitFor(
      "Array.from(document.querySelectorAll('[data-media-row]')).find(row=>row.querySelector('th[scope=row]')?.textContent.includes('CI synthetic film (not for publication)'))?.querySelector('details')?.open",
      value => value === true, "note-only match automatically reveals the collapsed note",
    );
    assert.match(
      await evaluate("Array.from(document.querySelectorAll('[data-media-row]')).find(row=>row.querySelector('th[scope=row]')?.textContent.includes('CI synthetic film (not for publication)'))?.querySelector('details .notes')?.textContent || ''"),
      /Second paragraph/, "Visible notes must explain the search match",
    );
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='emilie second';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "Array.from(document.querySelectorAll('[data-media-row]')).find(row=>row.querySelector('th[scope=row]')?.textContent.includes('CI synthetic film (not for publication)'))?.querySelector('details')?.open",
      value => value === true, "mixed metadata and note matches keep notes readable",
    );
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='emilie';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "Array.from(document.querySelectorAll('[data-media-row]')).find(row=>row.querySelector('th[scope=row]')?.textContent.includes('CI synthetic film (not for publication)'))?.querySelector('details')?.open",
      value => value === false, "switching to metadata-only search collapses unused notes",
    );
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-media-sort=year]').click()})()");
    await waitFor("document.querySelectorAll('[data-media-row]').length",
      count => count === mediaSource.films.length, "All source films remain after year sorting");
    const yearTitles = await evaluate(
      "Array.from(document.querySelectorAll('[data-media-row] th[scope=row]')).map(th=>th.textContent.trim())");
    assert.ok(yearTitles.findIndex(title => title.includes(secondFilmTitle)) >= 0 && yearTitles.findIndex(title => title.includes(firstFilmTitle)) >= 0 &&
      yearTitles.findIndex(title => title.includes(secondFilmTitle)) < yearTitles.findIndex(title => title.includes(firstFilmTitle)),
      "The 2024 synthetic film must precede the 2001 synthetic film by year");
    assert.equal(await evaluate("document.querySelector('[data-media-sort=year]')?.getAttribute('aria-pressed')"),"true");
    await evaluate("document.querySelector('[data-media-sort=rating]').click()");
    await waitFor("document.querySelector('[data-media-sort=rating]')?.getAttribute('aria-pressed')",
      value => value === "true", "Highest-rating sort activated");
    const ratingTitles = await evaluate(
      "Array.from(document.querySelectorAll('[data-media-row] th[scope=row]')).map(th=>th.textContent.trim())");
    assert.ok(ratingTitles.findIndex(title => title.includes(firstFilmTitle)) >= 0 && ratingTitles.findIndex(title => title.includes(secondFilmTitle)) >= 0 &&
      ratingTitles.findIndex(title => title.includes(firstFilmTitle)) < ratingTitles.findIndex(title => title.includes(secondFilmTitle)),
      "The 4.5-star synthetic film must precede the 1.5-star film by rating");
    // Media collection filters must survive navigation, reloads and link sharing.
    await navigate("/films/?q=emilie&sort=year&utm_source=fixture");
    await waitFor(
      "document.querySelector('[data-media-search]')?.value",
      value => value === "emilie", "film deep-link search restored",
    );
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "emilie", "all"), "film deep-link filtering restored",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-sort=year]')?.getAttribute('aria-pressed')"),"true",
      "Film deep-link sort must be restored");
    await evaluate("(()=>{const el=document.querySelector('[data-media-search]');el.value='zebra';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor(
      "new URL(location.href).searchParams.get('q')",
      value => value === "zebra", "media live search URL state",
    );
    assert.equal(await evaluate("new URL(location.href).searchParams.get('utm_source')"),"fixture",
      "Unrelated URL parameters must remain unchanged");
    await evaluate("document.querySelector('[data-media-sort=title]').click()");
    await waitFor(
      "new URL(location.href).searchParams.get('sort')",
      value => value === "title", "media sort selection URL state",
    );
    // Mark this DOM before reload so stale pre-navigation elements cannot satisfy
    // assertions. Wait for a newly created document and hydrated Vue island.
    await evaluate("document.documentElement.dataset.mediaPreReload = 'stale-document'");
    await command("Page.reload", {ignoreCache:true});
    await waitFor(
      "(()=>{const island=document.querySelector('.media-collection')?.closest('astro-island');" +
      "return document.readyState==='complete' && document.documentElement.dataset.mediaPreReload!=='stale-document'" +
      " && Boolean(island && !island.hasAttribute('ssr'));})()",
      Boolean, "new media document loaded and Vue island hydrated after reload",
    );
    await waitFor(
      "document.querySelector('[data-media-search]')?.value",
      value => value === "zebra", "media filter survives reload",
    );
    await waitFor(
      "document.querySelector('[data-media-sort=title]')?.getAttribute('aria-pressed')",
      value => value === "true", "media sort survives reload",
    );
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "zebra", "all"), "reloaded media filter shows expected records",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-clear-filters]')?.textContent.trim()"),"Clear filters");
    await evaluate("document.querySelector('[data-media-clear-filters]').focus()");
    assert.equal(await evaluate("document.activeElement?.hasAttribute('data-media-clear-filters')"), true,
      "Keyboard focus must reach Clear filters before activation");
    await command("Input.dispatchKeyEvent", {
      type:"keyDown",key:"Enter",code:"Enter",
      text:"\r",unmodifiedText:"\r",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,
    });
    await command("Input.dispatchKeyEvent", {
      type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,
    });
    await waitFor(
      "(()=>{const p=new URL(location.href).searchParams;return !p.has('q')&&!p.has('sort')})()",
      Boolean, "Clear filters removes active search and sort URL parameters",
    );
    await waitFor(
      "document.activeElement===document.querySelector('[data-media-search]')",
      Boolean, "Clearing filters by keyboard must return focus to the persistent search input",
    );
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "", "all"), "Clear filters restores all films",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-sort=rating]')?.getAttribute('aria-pressed')"),"true",
      "Clear filters restores default rating sort");
    assert.equal(await evaluate("document.querySelector('[data-media-search]')?.value"),"",
      "Clear filters empties the search field");
    assert.equal(await evaluate("document.querySelector('[data-media-clear-filters]')"),null,
      "Clear filters hides when nothing needs resetting");
    assert.equal(await evaluate("new URL(location.href).searchParams.get('utm_source')"),"fixture",
      "Clear filters preserves unrelated URL parameters");

    await navigate("/music/?q=cafe&sort=title");
    await waitFor(
      "document.querySelector('[data-media-search]')?.value",
      value => value === "cafe", "music deep-link search restored",
    );
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("music", "cafe", "all"), "music deep-link result",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-sort=title]')?.getAttribute('aria-pressed')"), "true");
    assert.equal(await evaluate("document.querySelector('[data-media-clear-filters]')?.textContent.trim()"),"Clear filters",
      "Music deep links must offer a reset action");
    await navigate("/tv/?q=no-matching-show");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("tv", "no-matching-show", "all"), "TV deep-link empty result",
    );
    await navigate("/films/?sort=untrusted");
    await waitFor(
      "(()=>{const island=document.querySelector('.media-collection')?.closest('astro-island');return Boolean(island && !island.hasAttribute('ssr'));})()",
      Boolean, "film controls hydrated before rejecting unsupported sort",
    );
    await waitFor(
      "new URL(location.href).searchParams.has('sort')",
      value => value === false, "unsupported media sort removed",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-sort=rating]')?.getAttribute('aria-pressed')"),"true");

    // A status-only deep link should filter the real disposable entries while
    // preserving unrelated URL state and the ordinary search/sort controls.
    await navigate("/films/?status=planned&sort=title&utm_source=fixture");
    await waitFor(
      "document.querySelector('[data-media-status-filter=planned]')?.getAttribute('aria-pressed')",
      value => value === "true", "Film status filter restored from URL",
    );
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "", "planned"), "Film status filter hides other statuses",
    );
    assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-media-row]')).find(row=>row.querySelector('th[scope=row]')?.textContent.includes('Zebra CI synthetic film'))?.querySelector('td:nth-of-type(4)')?.textContent.trim()"),"Planned",
      "Media status is displayed in a readable form for the planned fixture");
    await evaluate("document.querySelector('[data-media-status-filter=unspecified]').click()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "", "unspecified"), "Unspecified status finds no film fixture records",
    );
    assert.equal(await evaluate("new URL(location.href).searchParams.get('status')"),"unspecified");
    await evaluate("document.querySelector('[data-media-clear-filters]').click()");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("films", "", "all"), "Clear filters restores all media statuses",
    );
    await waitFor(
      "new URL(location.href).searchParams.has('status')",
      value => value === false, "Clear filters removes the status URL key",
    );
    assert.equal(await evaluate("new URL(location.href).searchParams.get('utm_source')"),"fixture",
      "Status reset preserves unrelated URL state");
    assert.equal(await evaluate("document.querySelector('[data-media-status-filter=all]')?.getAttribute('aria-pressed')"),"true");
    assert.equal(await evaluate("document.activeElement===document.querySelector('[data-media-search]')"),true,
      "Clearing status restores keyboard focus to the search control");
    await navigate("/tv/?status=planned");
    await waitFor(
      "document.querySelector('[data-media-count]')?.textContent.trim()",
      value => value === mediaCountLabel("tv", "", "planned"), "TV planned status filter",
    );
    await navigate("/music/?status=unsupported");
    await waitFor(
      "(()=>{const p=new URL(location.href).searchParams;return !p.has('status')})()",
      Boolean, "Unsupported status safely normalizes to All",
    );
    assert.equal(await evaluate("document.querySelector('[data-media-status-filter=all]')?.getAttribute('aria-pressed')"),"true");
    console.log("Media fixture URL smoke: EN collection deep links, reload, status/search/sort filters and reset passed");
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
    assert.equal(desktop.cardCount, sourceProjects.length,
      "Project cards must exactly match current source entries: " + route);
    assert.equal(desktop.alternate, true, "Project index language switch is missing: " + route);
    assert.equal(desktop.directSources, true, "Project card source links must be visible and localized: " + route);

    if (sourceProjects.length) {
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

    }

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

  // Inspect a current category rather than pinning a migrated record or count.
  if (categoryForDetails) {
    const selectedCount = categoryCount(categoryForDetails);
    await navigate("/bookmarks/" + categoryForDetails.slug + "/");
    await waitFor(
      "(()=>{const island=document.querySelector('.bookmark-browser')?.closest('astro-island');return Boolean(island && !island.hasAttribute('ssr'));})()",
      Boolean, "bookmark category listing Vue hydration",
    );
    await waitFor("document.querySelectorAll('.bookmark-entry').length",
      value => value === Math.min(50, selectedCount), "visible category bookmark entries");
    assert.equal(await evaluate("document.querySelectorAll('.bookmark-browser [data-bookmark-category]').length"),0,
      "Single-category listings must not show redundant category buttons");
    assert.equal(await evaluate("document.querySelector('.bookmark-controls')?.classList.contains('single-category')"),true);
    assert.equal(await evaluate("document.querySelectorAll('.bookmark-browser [data-bookmark-sort]').length"),3);
    assert.equal(await evaluate("document.querySelectorAll('.bookmark-entry [data-bookmark-detail-link]').length"),
      Math.min(50, selectedCount), "Each visible entry needs a detail link");
    const detailTarget = await evaluate(
      "document.querySelector('.bookmark-entry [data-bookmark-detail-link]')?.getAttribute('href')");
    assert.ok(detailTarget.startsWith("/bookmarks/" + categoryForDetails.slug + "/"),
      "Category detail URLs must remain category-local");
    const selected = bookmarkRecords.find(row => row.detailUrl === detailTarget);
    assert.ok(selected, "Displayed bookmark must exist in source parity manifest");
    assert.ok(await evaluate("document.querySelector('.bookmark-browser input[type=search]') !== null"),
      "Every category listing must retain an accessible search input");
    await evaluate("(()=>{const el=document.querySelector('.bookmark-browser input[type=search]');el.value=" +
      JSON.stringify(selected.title) + ";el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor("document.querySelectorAll('.bookmark-entry [data-bookmark-detail-link]').length",
      value => value > 0, "Category search must find the selected published title");
    assert.ok(await evaluate("Array.from(document.querySelectorAll('.bookmark-entry [data-bookmark-detail-link]')).some(a=>a.getAttribute('href')===" +
      JSON.stringify(detailTarget) + ")"), "Category search must preserve the matching detail link");
    await evaluate("(()=>{const el=document.querySelector('.bookmark-browser input[type=search]');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor("document.querySelectorAll('.bookmark-entry').length",
      value => value === Math.min(50, selectedCount), "Cleared category search restores current source results");
    assert.equal(await evaluate(
      "document.querySelector('.bookmark-entry [data-bookmark-detail-link]')?.textContent.trim()"),
      selected.notesUrl ? "Notes" : "Details", "Detail label must reflect published notes");
    await evaluate("document.querySelector('.bookmark-entry [data-bookmark-detail-link]').click()");
    await waitFor("location.pathname", value => value === detailTarget,
      "category listing detail link navigation");
    await waitFor("document.querySelector('.bookmark-detail h1')?.textContent.trim()",
      Boolean, "linked first-party bookmark detail page");
    assert.equal(await evaluate("document.querySelector('link[rel=canonical]')?.getAttribute('href')"),
      new URL(detailTarget, "https://www.peroniko.xyz").href,
      "Discovered bookmark detail page must retain its canonical URL");
    // Exercise adjacent routes from the current source collection, not a fixed category.
    const links = await evaluate(
      "Array.from(document.querySelectorAll('.bookmark-neighbors a')).map(a=>({rel:a.getAttribute('rel'),href:a.getAttribute('href')}))");
    if (selectedCount === 1) {
      assert.equal(links.length, 0, "Single bookmark categories have no neighbors");
    } else {
      assert.ok(links.length >= 1 && links.length <= 2,
        "Current category must expose its adjacent detail links");
      const chosen = links.find(link => link.rel === "next") ?? links[0];
      assert.ok(chosen.href.startsWith("/bookmarks/" + categoryForDetails.slug + "/"),
        "Navigation must remain in the current category");
      const reverse = chosen.rel === "next" ? "prev" : "next";
      await evaluate("document.querySelector('.bookmark-neighbors a[rel=" +
        JSON.stringify(chosen.rel) + "]').click()");
      await waitFor("location.pathname", value => value === chosen.href,
        "Adjacent bookmark link opens a different first-party detail page");
      assert.notEqual(chosen.href, detailTarget);
      assert.equal(await evaluate("document.querySelector('link[rel=canonical]')?.getAttribute('href')"),
        new URL(chosen.href, "https://www.peroniko.xyz").href,
        "Adjacent bookmark has its own canonical URL");
      assert.equal(await evaluate("document.querySelector('.bookmark-neighbors a[rel=" +
        JSON.stringify(reverse) + "]')?.getAttribute('href')"),
        detailTarget, "Adjacent page must link back to the source record");
    }
    console.log(`Browser bookmark detail smoke: ${selectedCount} category records have current source-driven links`);
  }

  // Homepages should expose the same first-party detail pages as the
  // bookmark browser, without altering external title links.
  for (const [route, label] of [["/", "Details"], ["/sh/", "Detalji"]]) {
    await navigate(route);
    const cards = await evaluate(
      "Array.from(document.querySelectorAll('.recent-grid li')).map(item=>({" +
      "detail:item.querySelector('a.recent-details')?.getAttribute('href')," +
      "label:item.querySelector('a.recent-details')?.textContent.trim()," +
      "titleTarget:item.querySelector('a:not(.recent-details)')?.getAttribute('target')||null" +
      "}))",
    );
    assert.equal(cards.length, Math.min(8, bookmarkRecords.length), "Homepage recent cards must reflect current content: " + route);
    assert.ok(cards.every(item => /^\/bookmarks\/[^/]+\/[^/]+\/$/.test(item.detail)),
      "Every recent card must reach a first-party detail URL: " + route);
    assert.ok(cards.every(item => item.label === label),
      "Recent internal links must be localized: " + route);
    assert.ok(cards.every(item => item.titleTarget === "_blank" || item.titleTarget === null),
      "Original external title links must retain their navigation behavior: " + route);
    if (cards.length) {
      const firstDetail = cards[0].detail;
      await evaluate("document.querySelector('.recent-grid a.recent-details').click()");
      await waitFor("location.pathname", value => value === firstDetail,
        "Homepage detail link should navigate to saved bookmark: " + route);
      await waitFor("document.querySelector('.bookmark-detail h1')?.textContent.trim()",
        Boolean, "Homepage-linked bookmark detail page loads: " + route);
      assert.equal(
        await evaluate("document.querySelector('link[rel=canonical]')?.getAttribute('href')"),
        new URL(firstDetail, "https://www.peroniko.xyz").href,
        "Homepage destination must retain canonical metadata: " + route,
      );
    }
  }
  console.log("Browser homepage bookmark smoke: EN/SH recent detail links and destination navigation passed");

  await navigate("/sh/search/");
  await waitFor(
    "(()=>{const browser=document.querySelector('.bookmark-browser');const island=browser?.closest('astro-island');return Boolean(browser && island && !island.hasAttribute('ssr') && browser.querySelector('input[type=search]'));})()",
    Boolean, "Serbo-Croatian bookmark search hydration");
  assert.equal(await evaluate("document.querySelector('input[type=search]')?.placeholder"),
    "Naziv, kategorija, adresa ili komentar");
  assert.equal(await evaluate("document.querySelectorAll('.bookmark-browser select').length"), 0,
    "Category and sort controls must be buttons, not dropdowns");
  const availableCategories = activeCategories.length > 1 ? activeCategories.length + 1 : 0;
  assert.equal(await evaluate("document.querySelectorAll('.bookmark-browser [data-bookmark-category]').length"),
    availableCategories, "Search filter buttons must reflect categories present in current content");
  assert.equal(await evaluate("document.querySelectorAll('[data-bookmark-sort][aria-pressed=true]').length"), 1);
  const emptyQuery = "no-matching-bookmark-ci-unique-unlikely";
  await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value=" +
    JSON.stringify(emptyQuery) + ";el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor("new URL(location.href).searchParams.get('q')",
    value => value === emptyQuery, "empty search URL state");
  await waitFor("document.querySelectorAll('li.bookmark-entry').length",
    value => value === 0, "empty search results");
  assert.equal(await evaluate("document.querySelector('.empty-result')?.textContent.trim()"),
    "Nema rezultata.");

  if (categoryForSearch && activeCategories.length > 1) {
    const label = categoryForSearch.label;
    const localizedLabel = categoryForSearch.labelSh;
    const expectedCount = categoryCount(categoryForSearch);
    await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));const b=[...document.querySelectorAll('.bookmark-browser [data-bookmark-category]')].find(button=>button.dataset.bookmarkCategory===" +
      JSON.stringify(label) + ");b.click()})()");
    await waitFor("new URL(location.href).searchParams.get('category')",
      value => value === label, "current category selected in URL");
    await waitFor("document.querySelectorAll('li.bookmark-entry').length",
      value => value === Math.min(50, expectedCount), "category results match current source");
    assert.equal(await evaluate("document.querySelector('li.bookmark-entry .metadata span')?.textContent"),
      localizedLabel, "Localized category metadata");
    await evaluate("(()=>{const el=document.querySelector('input[type=search]');el.value=" +
      JSON.stringify(localizedLabel) + ";el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor("new URL(location.href).searchParams.get('q')",
      value => value === localizedLabel, "localized category query state");
    await waitFor("document.querySelectorAll('li.bookmark-entry').length",
      value => value === Math.min(50, expectedCount), "localized category search");
    await command("Page.reload", { ignoreCache: true });
    await waitFor("document.querySelector('[data-bookmark-category][aria-pressed=true]')?.dataset.bookmarkCategory",
      value => value === label, "category restored after reload");
    await evaluate("document.querySelector('[data-bookmark-sort=title]').click()");
    await waitFor("new URL(location.href).searchParams.get('sort')",
      value => value === "title", "sort button URL state");
    await evaluate("document.querySelector('[data-bookmark-sort=newest]').click()");
    await waitFor("new URL(location.href).searchParams.has('sort')",
      value => value === false, "default sort removes query parameter");
    assert.equal(await evaluate("document.querySelector('.bookmark-summary button')?.textContent.trim()"),
      "Poništi filtere");
    await evaluate("document.querySelector('.bookmark-summary button').focus()");
    await command("Input.dispatchKeyEvent", {
      type:"keyDown",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",
      windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,
    });
    await command("Input.dispatchKeyEvent", {
      type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,
    });
    await waitFor("(()=>{const p=new URL(location.href).searchParams;return !p.has('q')&&!p.has('sort')&&!p.has('category')})()",
      Boolean, "clear filters removes active query state");
    await waitFor("document.activeElement===document.querySelector('.bookmark-browser input[type=search]')",
      Boolean, "clear filters restores focus");

    const switchState = new URLSearchParams({
      q: localizedLabel, category: label, sort: "title", utm_campaign: "not-preserved",
    });
    await navigate("/sh/search/?" + switchState);
    await waitFor("document.querySelector('[data-search-language-switch]')?.getAttribute('href')",
      value => typeof value === "string" && value.includes("sort=title"),
      "localized language switch preserves valid search filters");
    const href = await evaluate("document.querySelector('[data-search-language-switch]')?.href");
    assert.equal(new URL(href).pathname, "/search/");
    assert.equal(new URL(href).searchParams.get("category"), label);
    assert.equal(new URL(href).searchParams.has("utm_campaign"), false);
    await waitFor("(()=>{const island=document.querySelector('.bookmark-browser')?.closest('astro-island');return Boolean(island && !island.hasAttribute('ssr'));})()",
      Boolean, "search hydrated before language switch");
    const updatedQuery = localizedLabel === label ? label + " changed" : label;
    await evaluate("(()=>{const el=document.querySelector('.bookmark-browser input[type=search]');el.value=" +
      JSON.stringify(updatedQuery) + ";el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor("new URL(location.href).searchParams.get('q')",
      value => value === updatedQuery, "Live SH search updates current URL before switching");
    await evaluate("document.querySelector('[data-search-language-switch]').click()");
    await waitFor("location.pathname", value => value === "/search/", "SH-to-EN search switch");
    assert.deepEqual(await evaluate("(()=>{const p=new URL(location.href).searchParams;return [p.get('q'),p.get('category'),p.get('sort'),p.has('utm_campaign')]})()"),
      [updatedQuery,label,"title",false], "Language switch preserves edited search and active filters");
    await waitFor("(()=>{const island=document.querySelector('.bookmark-browser')?.closest('astro-island');return Boolean(island && !island.hasAttribute('ssr'));})()",
      Boolean, "EN search hydrated before reverse switch");
    await evaluate("(()=>{const el=document.querySelector('.bookmark-browser input[type=search]');el.value=" +
      JSON.stringify(localizedLabel) + ";el.dispatchEvent(new Event('input',{bubbles:true}))})()");
    await waitFor("new URL(location.href).searchParams.get('q')",
      value => value === localizedLabel, "Live EN query edits update URL before reverse switch");
    await evaluate("document.querySelector('[data-search-language-switch]').click()");
    await waitFor("location.pathname", value => value === "/sh/search/", "EN-to-SH search switch");
    assert.equal(await evaluate("new URL(location.href).searchParams.get('q')"),
      localizedLabel, "Returning to SH retains the latest edited query");
  }

  await command("Emulation.setDeviceMetricsOverride", {
    width: 375, height: 667, deviceScaleFactor: 1, mobile: true,
  });
  const mobileFilters = await evaluate(
    "(()=>{const buttons=[...document.querySelectorAll('.bookmark-controls button')];" +
    "return {width:document.documentElement.scrollWidth,viewport:innerWidth," +
    "buttonsFit:buttons.every(button=>{const box=button.getBoundingClientRect();" +
    "return box.width>0&&box.left>=-1&&box.right<=innerWidth+1;})};})()");
  assert.ok(mobileFilters.width <= mobileFilters.viewport + 1,
    "Bookmark controls must not overflow mobile viewport");
  assert.equal(mobileFilters.buttonsFit, true,
    "All category and sort buttons must fit mobile viewport");
  await command("Emulation.clearDeviceMetricsOverride");

  const searchRecord = bookmarkRecords.find(record => record.title && record.detailUrl);
  if (searchRecord) {
    await navigate("/search/?q=" + encodeURIComponent(searchRecord.title));
    await waitFor("document.querySelector('input[type=search]')?.value",
      value => value === searchRecord.title, "Title deep link restored from current record");
    await waitFor("document.querySelectorAll('li.bookmark-entry').length",
      value => value > 0, "Current bookmark title search returns results");
  }
  // Use a unique public-comment word when available; never depend on one
  // historical bookmark remaining in the collection.
  const normalize = text => text.normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase();
  const commentCase = bookmarkRecords.flatMap(record =>
    ((record.comments ?? "").match(/[\p{L}\p{N}]{8,}/gu) ?? []).map(word => ({record,word}))
  ).find(({record,word}) => {
    const needle = normalize(word);
    const otherFields = [record.title, record.category, record.url].join(" ");
    return !normalize(otherFields).includes(needle) &&
      bookmarkRecords.every(other => other.id === record.id ||
        !normalize([other.title,other.category,other.comments ?? "",other.url].join(" ")).includes(needle));
  });
  if (commentCase) {
    await navigate("/search/?q=" + encodeURIComponent(commentCase.word));
    await waitFor("document.querySelector('input[type=search]')?.value",
      value => value === commentCase.word, "comment-only query state");
    await waitFor("document.querySelectorAll('li.bookmark-entry').length",
      value => value >= 1, "current comment search finds a published bookmark");
    assert.equal(await evaluate("document.querySelector('li.bookmark-entry [data-bookmark-detail-link]')?.getAttribute('href')"),
      commentCase.record.detailUrl, "Comment-only search must return the source record");
    const visibleComment = await evaluate("document.querySelector('li.bookmark-entry .bookmark-comment')?.textContent.trim()");
    assert.ok(visibleComment && normalize(visibleComment).includes(normalize(commentCase.word)),
      "The independently matched comment must be visible in the search result");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('li.bookmark-entry .bookmark-comment')).webkitLineClamp"),
      "none", "Matching comment must not be visually line-clamped");
  }

  // Pick disposable titles absent from every current category; a real bookmark
  // addition must never invalidate the browser smoke's expected GitHub filename.
  const existingIds = new Set(bookmarkRecords.map(record => record.id.toLowerCase()));
  const unusedDraft = (title, stem) => {
    let suffix = 0;
    while (bookmarkCategories.some(category => existingIds.has(
      (category.section + "/" + stem + (suffix ? "-" + suffix : "")).toLowerCase()))) suffix++;
    return { title: title + (suffix ? " " + suffix : ""),
      stem: stem + (suffix ? "-" + suffix : "") };
  };
  const draft = unusedDraft("CI Browser Bookmark", "ci-browser-bookmark");
  const draftTitle = draft.title;
  const draftStem = draft.stem;
  const duplicateSource = bookmarkRecords.find(record => record.url && record.url.length < 512);
  const draftUrl = duplicateSource?.url ?? "https://example.org/ci-browser-bookmark";
  const draftPath = section => "content/bookmarks/" + section + "/" + draftStem + ".md";
  const openDraft = () => "/new-bookmark/?url=" + encodeURIComponent(draftUrl) +
    "&title=" + encodeURIComponent(draftTitle);
  await navigate(openDraft());
  await waitFor("document.querySelector('.new-bookmark .output code')?.textContent",
    value => value === draftPath(defaultCategory.section), "new bookmark Vue hydration");
  if (duplicateSource) {
    await waitFor("document.querySelector('.new-bookmark .duplicate')?.textContent",
      value => typeof value === "string" && value.includes("already appears"), "duplicate URL warning");
    const links = await evaluate(
      "Array.from(document.querySelectorAll('.new-bookmark [data-bookmark-duplicate-link]'))" +
      ".map(link=>({href:link.getAttribute('href'),id:link.textContent.trim()," +
      "target:link.getAttribute('target'),rel:link.getAttribute('rel'),label:link.getAttribute('aria-label')}))");
    assert.ok(links.length > 0, "Current duplicate URLs should be linked");
    for (const link of links) {
      const match = bookmarkRecords.find(record => record.id === link.id);
      assert.ok(match, "Duplicate warning must use current source identity");
      assert.equal(link.href, match.detailUrl);
      assert.equal(link.target, "_blank");
      assert.deepEqual(new Set(link.rel.split(/\s+/)), new Set(["noopener","noreferrer"]));
      assert.equal(link.label, "View existing bookmark: " + link.id);
    }
  }
  assert.equal(await evaluate("document.querySelectorAll('.new-bookmark select').length"), 0);
  assert.equal(await evaluate("document.querySelectorAll('.new-bookmark [data-bookmark-category]').length"),
    bookmarkCategories.length, "Composer buttons reflect category catalog");
  assert.equal(await evaluate("document.querySelector('.new-bookmark [data-bookmark-category][aria-pressed=true]')?.dataset.bookmarkCategory"),
    defaultCategory.section);
  const alternate = bookmarkCategories.find(category => category.section !== defaultCategory.section);
  if (alternate) {
    await evaluate("document.querySelector('.new-bookmark [data-bookmark-category=" +
      JSON.stringify(alternate.section) + "]').click()");
    await waitFor("document.querySelector('.new-bookmark .output code')?.textContent",
      value => value === draftPath(alternate.section), "category button selects alternate source folder");
    assert.equal(await evaluate("new URL(document.querySelector('.new-bookmark .actions a').href).searchParams.get('filename')"),
      draftPath(alternate.section), "GitHub editor respects selected category");
    const researchDraft = unusedDraft("Research paper", "research-paper");
    await navigate("/new-bookmark/?category=" + encodeURIComponent(alternate.slug) +
      "&url=https%3A%2F%2Fexample.org%2Fpaper&title=" + encodeURIComponent(researchDraft.title));
    await waitFor("document.querySelector('.new-bookmark [data-bookmark-category][aria-pressed=true]')?.dataset.bookmarkCategory",
      value => value === alternate.section, "category deep link selects the matching section");
    assert.equal(await evaluate("new URL(document.querySelector('.new-bookmark .actions a').href).searchParams.get('filename')"),
      "content/bookmarks/" + alternate.section + "/" + researchDraft.stem + ".md");
  }
  await navigate("/new-bookmark/?category=not-a-category&url=https%3A%2F%2Fexample.org%2Fpaper&title=Research%20paper");
  await waitFor("document.querySelector('.new-bookmark [data-bookmark-category][aria-pressed=true]')?.dataset.bookmarkCategory",
    value => value === defaultCategory.section, "Unknown category must select configured default");
  await navigate(openDraft());
  await waitFor("document.querySelector('.new-bookmark .output code')?.textContent",
    value => value === draftPath(defaultCategory.section), "configured default draft restored");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 375, height: 667, deviceScaleFactor: 1, mobile: true,
  });
  const mobileDraftCategories = await evaluate(
    "(()=>{const buttons=[...document.querySelectorAll('.new-bookmark [data-bookmark-category]')];" +
    "return {width:document.documentElement.scrollWidth,viewport:innerWidth," +
    "buttonsFit:buttons.every(button=>{const rect=button.getBoundingClientRect();" +
    "return rect.width>0&&rect.left>=-1&&rect.right<=innerWidth+1;})};})()");
  assert.ok(mobileDraftCategories.width <= mobileDraftCategories.viewport + 1);
  assert.equal(mobileDraftCategories.buttonsFit, true);
  await command("Emulation.clearDeviceMetricsOverride");
  const githubHref = await evaluate("document.querySelector('.new-bookmark .actions a')?.href");
  assert.ok(githubHref.startsWith("https://github.com/Fooftilly/Fooftilly.github.io/new/master?"));
  assert.equal(new URL(githubHref).searchParams.get("filename"),draftPath(defaultCategory.section));
  await navigate("/new-bookmark/?url=javascript%3Aalert(1)&title=Unsafe");
  await waitFor("document.querySelector('.new-bookmark .validation')?.textContent",
    value => typeof value === "string" && value.includes("Only HTTP and HTTPS"), "unsafe URL rejected");
  assert.equal(await evaluate("!!document.querySelector('.new-bookmark .output')"), false);
  const longUrl = "https://example.org/article?id=" + "x".repeat(2100);
  await navigate("/new-bookmark/?title=Long%20URL&url=" + encodeURIComponent(longUrl));
  await waitFor("document.querySelector('input[type=url]')?.value.length",
    value => value === longUrl.length, "long captured URL preserved");
  await waitFor("document.querySelector('.new-bookmark .validation')?.textContent",
    value => typeof value === "string" && value.includes("at most 2048"), "long URL rejected");
  const longDraft = unusedDraft("Long Notes", "long-notes");
  await navigate("/new-bookmark/?url=https%3A%2F%2Fexample.org%2F&title=" + encodeURIComponent(longDraft.title));
  await waitFor("document.querySelector('.new-bookmark .output code')?.textContent",
    value => value === "content/bookmarks/" + defaultCategory.section + "/" + longDraft.stem + ".md",
    "composer ready for long note");
  const notesSelector = JSON.stringify('textarea[placeholder="Longer personal notes"]');
  await evaluate("(()=>{const el=document.querySelector(" + notesSelector +
    ");el.value='a'.repeat(5000);el.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await waitFor("document.querySelector('.new-bookmark .actions a')?.href",
    value => value === "https://github.com/Fooftilly/Fooftilly.github.io/new/master",
    "long draft falls back to GitHub editor");
  assert.equal(await evaluate("document.querySelector('.new-bookmark .actions button:nth-child(2)')?.textContent.trim()"),
    "Copy full file path");
  assert.equal(await evaluate("document.querySelector('.new-bookmark .output code')?.textContent.trim()"),
    "content/bookmarks/" + defaultCategory.section + "/" + longDraft.stem + ".md");

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
  await evaluate("document.querySelector('.clear-rating').focus()");
  assert.equal(await evaluate("document.activeElement===document.querySelector('.clear-rating')"),true,
    "Clear rating must be reachable by keyboard");
  await command("Input.dispatchKeyEvent", {
    type:"keyDown",key:"Enter",code:"Enter",text:"\r",unmodifiedText:"\r",
    windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,
  });
  await command("Input.dispatchKeyEvent", {
    type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,nativeVirtualKeyCode:13,
  });
  await waitFor(
    "(()=>{const json=document.querySelector('.media-editor .preview textarea[readonly]')?.value;return json?JSON.parse(json).rating===undefined:false})()",
    Boolean,"clear rating omits the optional field",
  );
  await waitFor(
    "document.activeElement===document.querySelector('[data-media-rating]')",
    Boolean,"Clearing rating by keyboard must return focus to the rating slider",
  );
  assert.equal(await evaluate("document.querySelector('.clear-rating')"),null,
    "Clear rating button disappears at the unrated default");
  assert.equal(await evaluate("document.querySelector('[data-media-rating]')?.getAttribute('aria-valuetext')"),"Not rated");
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
