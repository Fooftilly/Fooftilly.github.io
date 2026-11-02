import test from "node:test";
import assert from "node:assert/strict";
import { getPublishedPaths, absoluteSiteUrl, renderSitemap } from "../src/lib/site-index.ts";

test("sitemap only includes implemented routes with canonical lowercase bookmark paths", () => {
  const paths = getPublishedPaths(["Art/UpperCase", "Perspectives/partII"]);
  assert.equal(paths.length, 18);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/about/"));
  assert.ok(paths.includes("/bookmarks/art/uppercase/"));
  assert.ok(paths.includes("/bookmarks/perspectives/partii/"));
  assert.ok(paths.includes("/bookmarks/paperbookarticle/"));
  assert.ok(paths.includes("/sr/"));
  assert.ok(paths.includes("/sr/about/"));
  assert.ok(paths.includes("/sr/posts/"));
  assert.ok(paths.includes("/posts/"));
  assert.ok(paths.includes("/search/"));
  assert.ok(paths.includes("/sr/search/"));
  assert.ok(!paths.includes("/new-bookmark/"), "Private admin must not appear in public routes");
  assert.ok(!paths.includes("/en/posts/"), "Do not add compatibility redirects");
});

test("duplicate URLs and malformed paths fail fast", () => {
  assert.throws(() => getPublishedPaths(["Art/A", "Art/a"]), /duplicate sitemap path/);
  assert.throws(() => absoluteSiteUrl("//other.example/"), /site-relative/);
});

test("XML text and canonical domain are escaped", () => {
  const xml = renderSitemap(["/", "/bookmarks/"]);
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /https:\/\/www\.peroniko\.xyz\/bookmarks\//);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});
