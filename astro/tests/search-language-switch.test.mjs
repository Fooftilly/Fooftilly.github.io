import test from "node:test";
import assert from "node:assert/strict";
import { searchLanguageSwitchHref } from "../src/lib/search-language-switch.ts";

test("EN/SH search language links preserve Unicode, category, and sort", () => {
  const active = new URL("https://www.peroniko.xyz/sh/search/");
  active.searchParams.set("q", "Članci i knjige");
  active.searchParams.set("category", "Articles & books");
  active.searchParams.set("sort", "title");
  const switched = new URL(searchLanguageSwitchHref(active.href, "/search/"), active);
  assert.equal(switched.pathname, "/search/");
  assert.equal(switched.searchParams.get("q"), "Članci i knjige");
  assert.equal(switched.searchParams.get("category"), "Articles & books");
  assert.equal(switched.searchParams.get("sort"), "title");
  const back = new URL(searchLanguageSwitchHref(switched.href, "/sh/search/"), active);
  assert.equal(back.pathname, "/sh/search/");
  assert.equal(back.search, switched.search);
});

test("drop unrelated URL parameters when switching search language", () => {
  const href = searchLanguageSwitchHref(
    "https://www.peroniko.xyz/search/?q=work&utm_source=private&debug=1&sort=oldest",
    "/sh/search/",
  );
  const target = new URL(href, "https://www.peroniko.xyz");
  assert.deepEqual([...target.searchParams.keys()], ["q", "sort"]);
  assert.equal(target.searchParams.get("q"), "work");
  assert.equal(target.searchParams.get("sort"), "oldest");
});

test("missing and empty filters do not leak from the target URL", () => {
  const href = searchLanguageSwitchHref(
    "https://www.peroniko.xyz/search/?q=",
    "/sh/search/?q=stale&category=Art&sort=title",
  );
  assert.equal(href, "/sh/search/");
});

test("retain the target path and hash without carrying source fragments", () => {
  assert.equal(searchLanguageSwitchHref(
    "https://www.peroniko.xyz/sh/search/?category=Music#old",
    "/search/#main",
  ), "/search/?category=Music#main");
});

test("EN/SH search language switching retains tag filters but drops tracking", () => {
  const href=searchLanguageSwitchHref(
    "https://www.peroniko.xyz/sh/search/?tag=Caf%C3%A9+culture&q=cafe&utm_source=external",
    "/search/",
  );
  const target=new URL(href,"https://www.peroniko.xyz");
  assert.equal(target.searchParams.get("tag"),"Café culture");
  assert.equal(target.searchParams.get("q"),"cafe");
  assert.equal(target.searchParams.has("utm_source"),false);
});

test("project index language switch preserves only active project search", () => {
  const href=searchLanguageSwitchHref(
    "https://www.peroniko.xyz/sh/projects/?q=Istra%C5%BEivanje&tag=unrelated&sort=title&utm=tracking",
    "/projects/",
  );
  const next=new URL(href,"https://www.peroniko.xyz");
  assert.equal(next.pathname,"/projects/");
  assert.deepEqual([...next.searchParams.keys()],["q"]);
  assert.equal(next.searchParams.get("q"),"Istraživanje");
});
