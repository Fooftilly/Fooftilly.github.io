import test from "node:test";
import assert from "node:assert/strict";
import { currentNavigationLink, navigationSectionForPath } from "../src/lib/site-navigation.ts";

test("current page is marked on exact EN and SH navigation routes", () => {
  const cases = [
    ["/", "home", "/"],
    ["/sh/", "home", "/sh/"],
    ["/posts/", "posts", "/posts/"],
    ["/sh/posts/", "posts", "/sh/posts/"],
    ["/bookmarks/", "bookmarks", "/bookmarks/"],
    ["/media/", "media", "/media/"],
    ["/projects/", "projects", "/projects/"],
    ["/sh/projects/", "projects", "/sh/projects/"],
    ["/search/", "search", "/search/"],
    ["/sh/search/", "search", "/sh/search/"],
    ["/new-bookmark/", "new-bookmark", "/new-bookmark/"],
    ["/about/", "about", "/about/"],
    ["/sh/about/", "about", "/sh/about/"],
    ["/privacy/", "privacy", "/privacy/"],
    ["/sh/privacy/", "privacy", "/sh/privacy/"],
  ];
  for (const [path, section, href] of cases) {
    assert.equal(navigationSectionForPath(path), section, path);
    assert.equal(currentNavigationLink(path, section, href), "page", path);
  }
});

test("nested pages mark their parent section as a location, not the current page", () => {
  for (const [path, section, href] of [
    ["/posts/article/", "posts", "/posts/"],
    ["/sh/posts/objava/", "posts", "/sh/posts/"],
    ["/bookmarks/paperbookarticle/", "bookmarks", "/bookmarks/"],
    ["/bookmarks/art/example/", "bookmarks", "/bookmarks/"],
    ["/projects/prks/", "projects", "/projects/"],
    ["/films/", "media", "/media/"],
    ["/music/", "media", "/media/"],
    ["/tv/", "media", "/media/"],
    ["/new-media/", "media", "/media/"],
  ]) {
    assert.equal(navigationSectionForPath(path), section, path);
    assert.equal(currentNavigationLink(path, section, href), "location", path);
  }
});

test("unrelated links, similar path prefixes and 404 pages never claim current", () => {
  for (const path of ["/404.html", "/new-bookmarklet/", "/bookmarklets/", "/postscript/", "/media2/", "/other/"]) {
    assert.equal(navigationSectionForPath(path), undefined, path);
    assert.equal(currentNavigationLink(path, "bookmarks", "/bookmarks/"), undefined, path);
  }
  assert.equal(currentNavigationLink("/projects/prks/", "bookmarks", "/bookmarks/"), undefined);
  assert.equal(currentNavigationLink("/sh/search/", "posts", "/sh/posts/"), undefined);
  assert.equal(currentNavigationLink("/search/", "search", "/sh/search/"), "location",
    "A section link with the wrong locale must not claim it is the exact page");
});
