import test from "node:test";
import assert from "node:assert/strict";
import {
  initializeAnalyticsConsent,
  GA_MEASUREMENT_ID,
  CONSENT_STORAGE_KEY,
  GOOGLE_TAG_URL,
  mayTrackPage,
} from "../src/lib/analytics-consent.ts";

function fixture(initialChoice = null, blockStorage = false, href = "https://www.peroniko.xyz/about/") {
  const values = new Map();
  if (initialChoice !== null) values.set(CONSENT_STORAGE_KEY, initialChoice);
  const listeners = new Map();
  const button = (kind) => ({
    attributes: {},
    hidden: false,
    addEventListener(event, callback) { listeners.set(kind + ":" + event, callback); },
    setAttribute(key, value) { this.attributes[key] = value; },
  });
  const settings = button("settings");
  const allow = button("allow");
  const decline = button("decline");
  const panel = {
    hidden: true,
    focusCalls: 0,
    focus(options) {
      assert.deepEqual(options, { preventScroll: true });
      this.focusCalls++;
    },
    querySelector(selector) {
      return { "[data-analytics-allow]": allow, "[data-analytics-decline]": decline }[selector] ?? null;
    },
  };
  const scripts = [];
  const cookies = new Map([["_ga", "tracking"], ["_ga_123", "tracking"], ["session", "keep"]]);
  const doc = {
    querySelector(selector) {
      if (selector === "[data-analytics-consent]") return panel;
      if (selector === "[data-analytics-settings]") return settings;
      if (selector === "[data-ga-loader]") return scripts.find(s => s.dataset.gaLoader) ?? null;
      return null;
    },
    head: { appendChild(script) { scripts.push(script); } },
    createElement(tag) {
      assert.equal(tag, "script");
      return { dataset: {}, async: false, src: "" };
    },
  };
  Object.defineProperty(doc, "cookie", {
    get() { return [...cookies].map(([name, value]) => `${name}=${value}`).join("; "); },
    set(value) {
      const name = value.split("=")[0].trim();
      if (value.includes("expires=Thu, 01 Jan 1970")) cookies.delete(name);
    },
  });
  let reloadCount = 0;
  const win = {
    localStorage: {
      getItem(key) { if (blockStorage) throw Error("storage blocked"); return values.get(key) ?? null; },
      setItem(key, value) { if (blockStorage) throw Error("storage blocked"); values.set(key, value); },
    },
    location: {
      href,
      reload() { reloadCount++; },
    },
  };
  const click = (kind) => {
    const handler = listeners.get(kind + ":click");
    assert.equal(typeof handler, "function");
    handler();
  };
  initializeAnalyticsConsent(doc, win);
  return { click, values, panel, settings, scripts, cookies, doc, win, get reloadCount() { return reloadCount; } };
}

test("No Google script, data layer or tracking without a visitor choice", () => {
  const f = fixture();
  assert.equal(f.panel.hidden, false);
  assert.equal(f.settings.attributes["aria-expanded"], "true");
  assert.equal(f.panel.focusCalls, 1, "New visitors should receive focus on the cookie notice");
  assert.deepEqual(f.scripts, []);
  assert.equal(f.win.dataLayer, undefined);
  f.click("decline");
  assert.equal(f.values.get(CONSENT_STORAGE_KEY), "denied");
  assert.equal(f.panel.hidden, true);
  assert.deepEqual(f.scripts, []);
  assert.equal(f.win.dataLayer, undefined);
});

test("Opt-in loads the tag once with consent v2, no ad permissions and no search terms", () => {
  const f = fixture();
  f.click("allow");
  assert.equal(f.values.get(CONSENT_STORAGE_KEY), "granted");
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, GOOGLE_TAG_URL);
  assert.equal(f.scripts[0].async, true);
  assert.equal(f.win[`ga-disable-${GA_MEASUREMENT_ID}`], false);
  assert.deepEqual(f.win.dataLayer.slice(0, 2).map(x => x.slice(0, 2)), [
    ["consent", "default"], ["consent", "update"],
  ]);
  assert.deepEqual(f.win.dataLayer[0][2], {
    analytics_storage: "denied", ad_storage: "denied",
    ad_user_data: "denied", ad_personalization: "denied",
  });
  assert.deepEqual(f.win.dataLayer[1][2], {
    analytics_storage: "granted", ad_storage: "denied",
    ad_user_data: "denied", ad_personalization: "denied",
  });
  const config = f.win.dataLayer.find(x => x[0] === "config");
  assert.equal(config[1], GA_MEASUREMENT_ID);
  assert.equal(config[2].page_location, "https://www.peroniko.xyz/about/");
  assert.equal(config[2].page_referrer, "");
  assert.equal(config[2].allow_google_signals, false);
  assert.equal(config[2].allow_ad_personalization_signals, false);
  f.click("settings");
  f.click("allow");
  assert.equal(f.scripts.length, 1, "Repeat acceptance must not load twice");
});

test("Declined preference stays opt-out and settings can be reopened", () => {
  const f = fixture("denied");
  assert.equal(f.panel.hidden, true);
  assert.equal(f.scripts.length, 0);
  f.click("settings");
  assert.equal(f.panel.hidden, false);
  assert.equal(f.settings.attributes["aria-expanded"], "true");
  assert.equal(f.panel.focusCalls, 1, "Reopening settings should focus the banner");
  f.click("decline");
  assert.equal(f.reloadCount, 0);
  assert.equal(f.scripts.length, 0);
});

test("Withdrawing previously granted consent disables further hits and reloads without the tag", () => {
  const f = fixture("granted");
  assert.equal(f.panel.hidden, true);
  assert.equal(f.scripts.length, 1);
  f.click("settings");
  f.click("decline");
  assert.equal(f.values.get(CONSENT_STORAGE_KEY), "denied");
  assert.equal(f.win[`ga-disable-${GA_MEASUREMENT_ID}`], true);
  assert.equal(f.reloadCount, 1);
  assert.equal(f.win.dataLayer.at(-1)[0], "consent");
  assert.equal(f.win.dataLayer.at(-1)[2].analytics_storage, "denied");
  assert.equal(f.cookies.has("_ga"), false);
  assert.equal(f.cookies.has("_ga_123"), false);
  assert.equal(f.cookies.get("session"), "keep");
  const nextPage = fixture(f.values.get(CONSENT_STORAGE_KEY));
  assert.equal(nextPage.scripts.length, 0, "Fresh page must not fetch Google after withdrawal");
});

test("Disabled localStorage cannot silently imply analytics consent", () => {
  const f = fixture("granted", true);
  assert.equal(f.scripts.length, 0);
  assert.equal(f.panel.hidden, false);
  f.click("decline");
  assert.equal(f.scripts.length, 0);
});

test("Never start analytics on draft, search, filter or query-bearing routes even after consent", () => {
  const excluded = [
    "https://www.peroniko.xyz/new-bookmark/?url=https%3A%2F%2Fprivate.test&title=Secret",
    "https://www.peroniko.xyz/new-bookmark/",
    "https://www.peroniko.xyz/new-media/",
    "https://www.peroniko.xyz/new-media",
    "https://www.peroniko.xyz/new-media/?title=Private%20Draft&value=%7B%22notes%22%3A%22private%22%7D",
    "https://www.peroniko.xyz/search/",
    "https://www.peroniko.xyz/sr/search/?q=confidential",
    "https://www.peroniko.xyz/bookmarks/",
    "https://www.peroniko.xyz/bookmarks/art/",
    "https://www.peroniko.xyz/about/?private=1",
  ];
  for (const href of excluded) {
    assert.equal(mayTrackPage(href), false, href);
    const f = fixture("granted", false, href);
    assert.equal(f.scripts.length, 0, href);
    assert.equal(f.win.dataLayer, undefined, href);
    f.click("settings");
    f.click("decline");
    assert.equal(f.reloadCount, 0, "No tag was running");
    assert.equal(f.cookies.has("_ga"), false, "Previously set GA cookie must be cleared");
    assert.equal(f.cookies.has("_ga_123"), false, "Previously set GA4 cookie must be cleared");
    assert.equal(f.cookies.get("session"), "keep", "Unrelated cookies must survive");
  }
  assert.equal(mayTrackPage("https://www.peroniko.xyz/bookmarks/art/some-public-bookmark/"), true);
  assert.equal(mayTrackPage("https://www.peroniko.xyz/media/"), true);
  assert.equal(mayTrackPage("https://www.peroniko.xyz/"), true);
});
