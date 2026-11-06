import test from "node:test";
import assert from "node:assert/strict";
import { getPublishedPaths, absoluteSiteUrl, renderSitemap } from "../src/lib/site-index.ts";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

test("sitemap uses configured categories and current bookmark IDs", () => {
  const first = BOOKMARK_CATEGORIES[0], last = BOOKMARK_CATEGORIES.at(-1);
  const ids = [first.section + "/UpperCase", last.section + "/partII"];
  const baseline = getPublishedPaths([]);
  const paths = getPublishedPaths(ids);
  assert.equal(paths.length, baseline.length + ids.length);
  // Independent route expectations must catch accidental mixed-case output.
  assert.ok(paths.includes("/bookmarks/" + first.slug + "/uppercase/"));
  assert.ok(paths.includes("/bookmarks/" + last.slug + "/partii/"));
  for (const category of BOOKMARK_CATEGORIES) {
    assert.ok(paths.includes("/bookmarks/" + category.slug + "/"));
  }
  for (const route of ["/", "/about/", "/bookmarks/", "/sh/", "/sh/about/", "/sh/posts/",
    "/posts/", "/search/", "/sh/search/", "/new-bookmark/", "/music/", "/films/",
    "/media/", "/tv/", "/new-media/", "/privacy/", "/sh/privacy/", "/projects/", "/sh/projects/"]) {
    assert.ok(paths.includes(route), "Missing site route " + route);
  }
  assert.ok(!paths.includes("/en/posts/"), "Do not add compatibility redirects");
});

test("duplicate URLs and malformed paths fail fast", () => {
  const section = BOOKMARK_CATEGORIES[0].section;
  assert.throws(() => getPublishedPaths([section + "/A", section + "/a"]), /duplicate sitemap path/);
  assert.throws(() => absoluteSiteUrl("//other.example/"), /site-relative/);
  assert.throws(() => getPublishedPaths([], ["UPPER"]), /Invalid project slug/);
  assert.throws(() => getPublishedPaths([], ["demo", "demo"]), /duplicate sitemap path/);
});

test("XML text and canonical domain are escaped", () => {
  const xml = renderSitemap(["/", "/bookmarks/"]);
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /https:\/\/www\.peroniko\.xyz\/bookmarks\//);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});

test("project routes are independent of the bookmark inventory", () => {
  const projects = ["one-project", "another-project", "third-project"];
  const base = getPublishedPaths([]);
  const paths = getPublishedPaths([], projects);
  assert.equal(paths.length, base.length + projects.length);
  for (const slug of projects) assert.ok(paths.includes("/projects/" + slug + "/"));
});
