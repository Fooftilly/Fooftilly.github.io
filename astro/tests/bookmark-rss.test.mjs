import test from "node:test";
import assert from "node:assert/strict";
import { renderBookmarkRss } from "../src/lib/bookmark-rss.ts";
import { BOOKMARK_CATEGORIES, categoryBySlug, bookmarkCategoryPath, bookmarkCategoryFeedPath } from "../src/lib/bookmark-categories.ts";
import { bookmarkDetailPath } from "../src/lib/bookmark-path.ts";

const first = BOOKMARK_CATEGORIES[0];
const second = BOOKMARK_CATEGORIES.find(c => c.section !== first.section) ?? first;

test("each configured category supplies matching canonical and RSS paths", () => {
  assert.ok(BOOKMARK_CATEGORIES.length > 0);
  assert.equal(categoryBySlug("invalid"), undefined);
  for (const category of BOOKMARK_CATEGORIES) {
    assert.equal(categoryBySlug(category.slug)?.section, category.section);
    assert.equal(bookmarkCategoryPath(category.slug), "/bookmarks/" + category.slug + "/");
    assert.equal(bookmarkCategoryFeedPath(category.slug), "/bookmarks/" + category.slug + "/index.xml");
  }
});

test("RSS escaping, stable identifiers, dates and source metadata", () => {
  const xml = renderBookmarkRss({
    title: "Bookmarks & <Quotes>",
    description: "Notes & links",
    path: "/bookmarks/index.xml",
    bookmarks: [
      { id: first.section + "/a&b", title: 'A & <B> "Quote"', category: first.label,
        date: "2024-05-26", url: "https://example.org/?a=1&b=2", rawLink: "", comments: "Text <tag> & source" },
      { id: second.section + "/missing", title: "Missing link", category: second.label,
        date: "", url: "", rawLink: "", comments: "" },
    ],
  });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.match(xml, /Bookmarks &amp; &lt;Quotes&gt;/);
  assert.match(xml, /A &amp; &lt;B&gt; &quot;Quote&quot;/);
  assert.match(xml, /https:\/\/example\.org\/\?a=1&amp;b=2/);
  assert.ok(xml.includes("urn:peroniko:bookmark:" + first.section + "/a&amp;b"));
  assert.match(xml, /Text &lt;tag&gt; &amp; source/);
  assert.match(xml, /Sun, 26 May 2024 00:00:00 GMT/);
  const fallback = "https://www.peroniko.xyz" + bookmarkDetailPath(second.section + "/missing");
  assert.ok(xml.includes("<link>" + fallback + "</link>"),
    "A bookmark without a safe source URL should link to its own detail page");
  assert.equal((xml.match(/<item>/g) ?? []).length, 2);
  assert.equal((xml.match(/<pubDate>/g) ?? []).length, 1);
  assert.equal((xml.match(/<guid isPermaLink="false">/g) ?? []).length, 2);
});

test("RSS strips XML-illegal control characters", () => {
  const xml = renderBookmarkRss({
    title: "Test", description: "Test", path: "/bookmarks/index.xml",
    bookmarks: [{ id: first.section + "/one", title: "Bad\u0001 name",
      category: first.label, date: "", url: "", rawLink: "", comments: "" }],
  });
  assert.ok(!xml.includes("\u0001"));
});

test("RSS preserves external destinations and uses exact local routes for missing sources", () => {
  const target = second.section + "/članak";
  const xml = renderBookmarkRss({
    title:"Peroniko — RSS",description:"Fallback",path:"/index.xml",
    bookmarks:[
      {id:first.section + "/external",title:"External",category:first.label,date:"2026-01-02",
        url:"https://example.org/item?a=1&b=2",rawLink:"",comments:""},
      {id:target,title:"No external source",category:second.label,date:"2026-01-01",
        url:"",rawLink:"",comments:"Public context"},
    ],
  });
  assert.match(xml, /<link>https:\/\/example\.org\/item\?a=1&amp;b=2<\/link>/,
    "Valid external RSS links must remain untouched");
  assert.ok(xml.includes("<link>https://www.peroniko.xyz" + bookmarkDetailPath(target) + "</link>"),
    "Missing-source links must point to the encoded canonical detail route");
  assert.ok(xml.includes('<guid isPermaLink="false">urn:peroniko:bookmark:' + target + "</guid>"),
    "Stable GUIDs must not depend on link destinations");
  assert.match(xml, /<description>Public context<\/description>/);
});
