import test from "node:test";
import assert from "node:assert/strict";
import { getPublishedPaths, absoluteSiteUrl, renderSitemap } from "../src/lib/site-index.ts";

test("sitemap only includes implemented routes with canonical lowercase bookmark paths", () => {
  const paths = getPublishedPaths(["Art/UpperCase", "Perspectives/partII"]);
  assert.equal(paths.length, 26);
  assert.ok(paths.includes("/"));
  assert.ok(paths.includes("/about/"));
  assert.ok(paths.includes("/bookmarks/art/uppercase/"));
  assert.ok(paths.includes("/bookmarks/perspectives/partii/"));
  assert.ok(paths.includes("/bookmarks/paperbookarticle/"));
  assert.ok(paths.includes("/sh/"));
  assert.ok(paths.includes("/sh/about/"));
  assert.ok(paths.includes("/sh/posts/"));
  assert.ok(paths.includes("/posts/"));
  assert.ok(paths.includes("/search/"));
  assert.ok(paths.includes("/sh/search/"));
  assert.ok(paths.includes("/new-bookmark/"));
  assert.ok(paths.includes("/music/"));
  assert.ok(paths.includes("/films/"));
  assert.ok(paths.includes("/media/"));
  assert.ok(paths.includes("/tv/"));
  assert.ok(paths.includes("/new-media/"));
  assert.ok(paths.includes("/privacy/"));
  assert.ok(paths.includes("/sh/privacy/"));
  assert.ok(paths.includes("/projects/"));
  assert.ok(!paths.includes("/en/posts/"), "Do not add compatibility redirects");
});

test("duplicate URLs and malformed paths fail fast", () => {
  assert.throws(() => getPublishedPaths(["Art/A", "Art/a"]), /duplicate sitemap path/);
  assert.throws(() => absoluteSiteUrl("//other.example/"), /site-relative/);
  assert.throws(()=>getPublishedPaths([],["UPPER"]),/Invalid project slug/);
  assert.throws(()=>getPublishedPaths([],["prks","prks"]),/duplicate sitemap path/);
});

test("XML text and canonical domain are escaped", () => {
  const xml = renderSitemap(["/", "/bookmarks/"]);
  assert.match(xml, /^<\?xml version="1\.0"/);
  assert.match(xml, /https:\/\/www\.peroniko\.xyz\/bookmarks\//);
  assert.equal((xml.match(/<url>/g) ?? []).length, 2);
});

test("project routes are canonical and remain independent of bookmark counts",()=>{
  const paths=getPublishedPaths([],["prks","kokoro-extension","local-search-mcp"]);
  assert.equal(paths.length,17+7+1+3);
  for(const slug of ["prks","kokoro-extension","local-search-mcp"]){
    assert.ok(paths.includes("/projects/"+slug+"/"));
  }
});
