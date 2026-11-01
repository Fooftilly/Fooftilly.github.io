import test from "node:test";
import assert from "node:assert/strict";
import { filterBookmarks, sortBookmarks } from "../static/js/bookmarks.mjs";

const records = [
  { title: "Árbol reference", category: "Art", url: "https://example.org/trees", date: "2024-01-01" },
  { title: "Hugo documentation", category: "Resource", url: "https://gohugo.io", date: "2026-05-01" },
  { title: "2048", category: "Fun", url: "https://play2048.co", date: "2025-05-01" },
];

test("empty search returns all entries without modifying them", () => {
  assert.deepEqual(filterBookmarks(records, "   "), records);
  assert.notStrictEqual(filterBookmarks(records, ""), records);
});

test("search matches case-insensitive and accent-insensitive words", () => {
  assert.deepEqual(filterBookmarks(records, "ARBOL"), [records[0]]);
  assert.deepEqual(filterBookmarks(records, "hUgO RESOURCE"), [records[1]]);
});

test("search matches URLs as well as titles and categories", () => {
  assert.deepEqual(filterBookmarks(records, "play2048"), [records[2]]);
  assert.deepEqual(filterBookmarks(records, "site-not-found"), []);
});

test("newest and oldest sorting use date order", () => {
  assert.deepEqual(sortBookmarks(records, "newest"), [records[1], records[2], records[0]]);
  assert.deepEqual(sortBookmarks(records, "oldest"), [records[0], records[2], records[1]]);
});

test("title sorting is case-insensitive and does not mutate input", () => {
  const initial = [...records];
  assert.deepEqual(sortBookmarks(records, "title"), [records[2], records[0], records[1]]);
  assert.deepEqual(records, initial);
});

test("same-date sort has deterministic title tie-breaking", () => {
  const tied = [
    { title: "Zebra", date: "2026-01-01" },
    { title: "Apple", date: "2026-01-01" },
  ];
  assert.deepEqual(sortBookmarks(tied, "newest"), [tied[1], tied[0]]);
});
