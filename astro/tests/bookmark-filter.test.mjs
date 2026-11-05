import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortBookmarks } from "../src/lib/bookmark-filter.ts";

const items = [
  { id: "2", title: "Árbol reference", category: "Art", date: "2024-05-01", url: "https://example.org/tree" },
  { id: "1", title: "Astro documentation", category: "Resource", date: "2025-01-01", url: "https://docs.astro.build/en" },
  { id: "3", title: "City art", category: "Art", date: "2025-01-01", url: "https://example.org/city" },
  { id: "5", title: "Old date", category: "Music", date: "", url: "" },
  { id: "4", title: "City art", category: "Art", date: "2025-01-01", url: "https://example.org/city2" },
];
const defaults = { query: "", category: "all", sort: "newest" };

test("accent-insensitive AND terms match title, category and URL", () => {
  assert.deepEqual(filterAndSortBookmarks(items, { ...defaults, query: "ARBOL ART" }).map(x => x.id), ["2"]);
  assert.deepEqual(filterAndSortBookmarks(items, { ...defaults, query: "astro docs.astro" }).map(x => x.id), ["1"]);
  assert.deepEqual(filterAndSortBookmarks(items, { ...defaults, query: "art nonexistent" }), []);
});

test("category and query filters combine without mutating the source list", () => {
  const before = structuredClone(items);
  assert.deepEqual(filterAndSortBookmarks(items, { ...defaults, category: "Art", query: "city" }).map(x => x.id), ["3", "4"]);
  assert.deepEqual(items, before);
});

test("newest and oldest sort by date, title and id for ties", () => {
  assert.deepEqual(filterAndSortBookmarks(items, defaults).map(x => x.id), ["1", "3", "4", "2", "5"]);
  assert.deepEqual(filterAndSortBookmarks(items, { ...defaults, sort: "oldest" }).map(x => x.id), ["2", "1", "3", "4", "5"]);
});

test("title sort handles accent variations and stable duplicate names", () => {
  const ids = filterAndSortBookmarks(items, { ...defaults, sort: "title" }).map(x => x.id);
  assert.deepEqual(ids, ["2", "1", "3", "4", "5"]);
});

test("empty query returns all items and missing dates stay last", () => {
  assert.equal(filterAndSortBookmarks(items, { ...defaults, query: "   " }).length, items.length);
  assert.equal(filterAndSortBookmarks(items, { ...defaults, sort: "oldest" }).at(-1).id, "5");
});

test("Serbo-Croatian category text can be searched without changing canonical filter keys", () => {
  const articles = [{
    id: "articles-1", title: "Example page", category: "Articles & books",
    date: "2026-02-01", url: "https://example.org/article",
  }];
  const search = (query, lang) => filterAndSortBookmarks(articles, {
    ...defaults, query, lang, category: "Articles & books",
  }).map(item => item.id);
  assert.deepEqual(search("Članci i knjige", "sh"), ["articles-1"]);
  assert.deepEqual(search("clanci i knjige", "sh"), ["articles-1"]);
  assert.deepEqual(search("Articles & books", "sh"), ["articles-1"]);
  assert.deepEqual(search("Članci i knjige", "en"), []);
  assert.deepEqual(search("Članci i knjige", "sh"), ["articles-1"]);
  assert.deepEqual(filterAndSortBookmarks(articles, {
    ...defaults, lang: "sh", category: "Music", query: "Članci",
  }), []);
});

test("existing public bookmark comments are searchable but blank comments do not match", () => {
  const records = [
    { id: "Resource/archive", title: "Heritage library", category: "Resources",
      date: "2026-01-01", url: "https://example.org/library/",
      comments: "300k+ archive photos on Flickr" },
    { id: "Resource/other", title: "Another library", category: "Resources",
      date: "2026-01-01", url: "https://example.org/other/", comments: "" },
  ];
  const select = (query) => filterAndSortBookmarks(records, {...defaults, query}).map(item => item.id);
  assert.deepEqual(select("300k+"), ["Resource/archive"]);
  assert.deepEqual(select("ARCHIVE photos"), ["Resource/archive"]);
  assert.deepEqual(select("flickr heritage"), ["Resource/archive"]);
  assert.deepEqual(select("flickr no-match"), []);
  assert.deepEqual(select("archive"), ["Resource/archive"]);
  const longComment = [{ ...records[0], comments: "Archive details. ".repeat(140) + "rare-final-needle" }];
  assert.deepEqual(filterAndSortBookmarks(longComment, {...defaults, query: "rare-final-needle"})
    .map(item => item.id), ["Resource/archive"],
    "The whole public comment must be indexed, including its ending");
  assert.deepEqual(select("library"), ["Resource/other", "Resource/archive"].sort((a,b) => records.find(x=>x.id===a).title.localeCompare(records.find(x=>x.id===b).title)));
});
