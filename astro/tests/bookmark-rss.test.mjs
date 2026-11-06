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
  assert.match(xml, /<link>https:\/\/www\.peroniko\.xyz\/bookmarks\/music\/missing\/<\/link>/,
    "A bookmark without a safe external URL should link to its own detail page");
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

test("RSS preserves valid external destinations and uses exact local route for missing sources", () => {
  const xml=renderBookmarkRss({
    title:"Peroniko — RSS",description:"Fallback",path:"/index.xml",
    bookmarks:[
      {id:"Art/external",title:"External",category:"Art",date:"2026-01-02",url:"https://example.org/item?a=1&b=2",rawLink:"",comments:""},
      {id:"PaperBookArticle/članak",title:"No external source",category:"Articles & books",date:"2026-01-01",url:"",rawLink:"",comments:"Public context"},
    ],
  });
  assert.match(xml, /<link>https:\/\/example\.org\/item\?a=1&amp;b=2<\/link>/,
    "Existing valid external RSS links must remain untouched");
  assert.match(xml, /<link>https:\/\/www\.peroniko\.xyz\/bookmarks\/paperbookarticle\/%C4%8Dlanak\/<\/link>/,
    "Missing-source links must point to the encoded canonical detail route");
  assert.match(xml, /<guid isPermaLink="false">urn:peroniko:bookmark:PaperBookArticle\/članak<\/guid>/,
    "Stable GUIDs are independent of the updated RSS link destinations");
  assert.match(xml, /<description>Public context<\/description>/);
});
