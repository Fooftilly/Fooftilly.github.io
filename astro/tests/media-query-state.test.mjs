import test from "node:test";
import assert from "node:assert/strict";
import { readMediaQueryState, mediaFilterHref } from "../src/lib/media-query-state.ts";

test("deep link restores supported sort options and Unicode search text", () => {
  assert.deepEqual(readMediaQueryState("?q=%C3%89milie%20%26%20Cafe&sort=year"), {
    query: "Émilie & Cafe", sort: "year", status: "all",
  });
  assert.deepEqual(readMediaQueryState("?sort=title"), {query: "", sort: "title", status: "all"});
  assert.deepEqual(readMediaQueryState(""), {query: "", sort: "rating", status: "all"});
});

test("unknown sort values fall back to rating instead of changing collection order", () => {
  for (const sort of ["unexpected", "oldest", "rating%20", "YEAR", ""]) {
    assert.equal(readMediaQueryState("?sort=" + sort).sort, "rating");
  }
});

test("shareable URL preserves unrelated parameters, hash and active route", () => {
  const url = mediaFilterHref("https://www.peroniko.xyz/music/?utm_source=local&q=old&sort=year#collection",
    "  Café notes  ", "title");
  assert.equal(url, "/music/?utm_source=local&q=Caf%C3%A9+notes&sort=title#collection");
  const target = new URL(url, "https://www.peroniko.xyz");
  assert.equal(target.searchParams.get("q"), "Café notes");
  assert.equal(target.searchParams.get("sort"), "title");
  assert.equal(target.searchParams.get("utm_source"), "local");
});

test("default filters remove their query keys without deleting unrelated state", () => {
  assert.equal(mediaFilterHref(
    "https://www.peroniko.xyz/films/?q=previous&sort=title&kind=films#top", "  ", "rating",
  ), "/films/?kind=films#top");
  assert.equal(mediaFilterHref("https://www.peroniko.xyz/tv/?sort=invalid", "", "rating"), "/tv/");
});

test("normalizes duplicate search and sort keys into one canonical pair", () => {
  const out = mediaFilterHref(
    "https://www.peroniko.xyz/films/?q=a&q=b&sort=year&sort=title",
    "Film One", "year",
  );
  const params = new URL(out, "https://www.peroniko.xyz").searchParams;
  assert.deepEqual(params.getAll("q"), ["Film One"]);
  assert.deepEqual(params.getAll("sort"), ["year"]);
});

test("status deep links accept only the public collection's supported statuses", () => {
  for (const status of ["finished","in-progress","planned","unspecified"]) {
    assert.equal(readMediaQueryState("?status="+status).status, status);
  }
  for (const status of ["","other","FINISHED","admin","../planned"]) {
    assert.equal(readMediaQueryState("?status="+encodeURIComponent(status)).status,"all");
  }
});

test("status filters have one canonical query parameter and reset cleanly", () => {
  const url = mediaFilterHref("https://www.peroniko.xyz/films/?status=planned&status=finished&q=old&utm_source=fixture#list",
    "", "rating", "unspecified");
  assert.equal(url, "/films/?utm_source=fixture&status=unspecified#list");
  const params = new URL(url,"https://www.peroniko.xyz").searchParams;
  assert.deepEqual(params.getAll("status"),["unspecified"]);
  assert.equal(mediaFilterHref("https://www.peroniko.xyz/music/?status=finished&utm_source=fixture",
    "", "rating", "all"),"/music/?utm_source=fixture");
});
