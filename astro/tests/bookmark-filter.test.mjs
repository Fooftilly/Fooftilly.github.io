import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortBookmarks } from "../src/lib/bookmark-filter.ts";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

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

test("Serbo-Croatian category labels are searchable through current category metadata", () => {
  const category = BOOKMARK_CATEGORIES.find(item => item.labelSh !== item.label && /[^\x00-\x7F]/.test(item.labelSh))
    ?? BOOKMARK_CATEGORIES.find(item => item.labelSh !== item.label);
  assert.ok(category, "Expected at least one translated category");
  const articles = [{
    id: "translated-1", title: "Example page", category: category.label,
    date: "2026-02-01", url: "https://example.org/article",
  }];
  const search = (query, lang) => filterAndSortBookmarks(articles, {
    ...defaults, query, lang, category: category.label,
  }).map(item => item.id);
  assert.deepEqual(search(category.labelSh, "sh"), ["translated-1"]);
  const unfolded = category.labelSh.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  assert.deepEqual(search(unfolded, "sh"), ["translated-1"],
    "Serbo-Croatian search must match a diacritic-free form of the displayed label");
  assert.deepEqual(search(category.label, "sh"), ["translated-1"]);
  if (category.labelSh !== category.label) assert.deepEqual(search(category.labelSh, "en"), []);
  assert.deepEqual(filterAndSortBookmarks(articles, {
    ...defaults, lang: "sh", category: "not-a-category", query: category.labelSh,
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
