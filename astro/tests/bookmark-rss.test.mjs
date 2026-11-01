import test from "node:test";
import assert from "node:assert/strict";
import { renderBookmarkRss } from "../src/lib/bookmark-rss.ts";
import { BOOKMARK_CATEGORIES, categoryBySlug, bookmarkCategoryPath, bookmarkCategoryFeedPath } from "../src/lib/bookmark-categories.ts";

test("category slugs preserve the seven Hugo section URL paths", () => {
  assert.equal(BOOKMARK_CATEGORIES.length, 7);
  assert.equal(categoryBySlug("paperbookarticle")?.section, "PaperBookArticle");
  assert.equal(categoryBySlug("invalid"), undefined);
  for (const c of BOOKMARK_CATEGORIES) {
    assert.equal(bookmarkCategoryPath(c.slug), `/bookmarks/${c.slug}/`);
    assert.equal(bookmarkCategoryFeedPath(c.slug), `/bookmarks/${c.slug}/index.xml`);
  }
});

test("RSS escaping, stable identifiers, dates and source metadata", () => {
  const xml = renderBookmarkRss({
    title: "Bookmarks & <Quotes>",
    description: "Notes & links",
    path: "/bookmarks/index.xml",
    bookmarks: [
      { id: "Art/a&b", title: 'A & <B> "Quote"', category: "Art", date: "2024-05-26", url: "https://example.org/?a=1&b=2", rawLink: "", comments: "Text <tag> & source" },
      { id: "Music/missing", title: "Missing link", category: "Music", date: "", url: "", rawLink: "", comments: "" },
    ],
  });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /Bookmarks &amp; &lt;Quotes&gt;/);
  assert.match(xml, /A &amp; &lt;B&gt; &quot;Quote&quot;/);
  assert.match(xml, /https:\/\/example\.org\/\?a=1&amp;b=2/);
  assert.match(xml, /urn:peroniko:bookmark:Art\/a&amp;b/);
  assert.match(xml, /Text &lt;tag&gt; &amp; source/);
  assert.match(xml, /Sun, 26 May 2024 00:00:00 GMT/);
  assert.match(xml, /<link>https:\/\/www\.peroniko\.xyz\/bookmarks\/<\/link>/);
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.equal((xml.match(/<pubDate>/g) ?? []).length, 1);
  assert.equal((xml.match(/<guid isPermaLink="false">/g) ?? []).length, 2);
});

test("RSS strips XML-illegal control characters", () => {
  const xml = renderBookmarkRss({
    title: "Test",
    description: "Test",
    path: "/bookmarks/index.xml",
    bookmarks: [{ id: "Art/one", title: "Bad\u0001 name", category: "Art", date: "", url: "", rawLink: "", comments: "" }],
  });
  assert.ok(!xml.includes("\u0001"));
});
