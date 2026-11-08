import test from "node:test";
import assert from "node:assert/strict";
import { readMediaQueryState, mediaFilterHref } from "../src/lib/media-query-state.ts";

test("deep link restores supported sort options and Unicode search text", () => {
  assert.deepEqual(readMediaQueryState("?q=%C3%89milie%20%26%20Cafe&sort=year"), {
    query: "Émilie & Cafe", sort: "year", status: "all", minRating: 0, missingRefsOnly: false,
  });
  assert.deepEqual(readMediaQueryState("?sort=title"), {query: "", sort: "title", status: "all", minRating: 0, missingRefsOnly: false});
  assert.deepEqual(readMediaQueryState(""), {query: "", sort: "rating", status: "all", minRating: 0, missingRefsOnly: false});
});

test("unknown sort values fall back to rating instead of changing collection order", () => {
  for (const sort of ["unexpected", "oldest", "rating%20", "YEAR", ""]) {
    assert.equal(readMediaQueryState("?sort=" + sort).sort, "rating");
  }
});

test("shareable URL preserves unrelated parameters, hash and active route", () => {
  const url = mediaFilterHref("https://www.peroniko.xyz/music/?utm_source=local&q=old&sort=year#collection",
    "  Café notes  ", "title");
  assert.equal(url, "/music/?utm_source=local&q=Caf%C3%A9+notes&sort=title#collection");
  const target = new URL(url, "https://www.peroniko.xyz");
  assert.equal(target.searchParams.get("q"), "Café notes");
  assert.equal(target.searchParams.get("sort"), "title");
  assert.equal(target.searchParams.get("utm_source"), "local");
});

test("default filters remove their query keys without deleting unrelated state", () => {
  assert.equal(mediaFilterHref(
    "https://www.peroniko.xyz/films/?q=previous&sort=title&kind=films#top", "  ", "rating",
  ), "/films/?kind=films#top");
  assert.equal(mediaFilterHref("https://www.peroniko.xyz/tv/?sort=invalid", "", "rating"), "/tv/");
});

test("normalizes duplicate search and sort keys into one canonical pair", () => {
  const out = mediaFilterHref(
    "https://www.peroniko.xyz/films/?q=a&q=b&sort=year&sort=title",
    "Film One", "year",
  );
  const params = new URL(out, "https://www.peroniko.xyz").searchParams;
  assert.deepEqual(params.getAll("q"), ["Film One"]);
  assert.deepEqual(params.getAll("sort"), ["year"]);
});

test("status deep links accept only the public collection's supported statuses", () => {
  for (const status of ["finished","in-progress","planned","unspecified"]) {
    assert.equal(readMediaQueryState("?status="+status).status, status);
  }
  for (const status of ["","other","FINISHED","admin","../planned"]) {
    assert.equal(readMediaQueryState("?status="+encodeURIComponent(status)).status,"all");
  }
});

test("status filters have one canonical query parameter and reset cleanly", () => {
  const url = mediaFilterHref("https://www.peroniko.xyz/films/?status=planned&status=finished&q=old&utm_source=fixture#list",
    "", "rating", "unspecified");
  assert.equal(url, "/films/?utm_source=fixture&status=unspecified#list");
  const params = new URL(url,"https://www.peroniko.xyz").searchParams;
  assert.deepEqual(params.getAll("status"),["unspecified"]);
  assert.equal(mediaFilterHref("https://www.peroniko.xyz/music/?status=finished&utm_source=fixture",
    "", "rating", "all"),"/music/?utm_source=fixture");
});

test("restored history URLs round-trip through the public filter codec", () => {
  const history = [
    "/films/?q=blue&status=finished&sort=year&utm_source=bookmarks",
    "/films/?q=green&status=planned",
    "/films/?sort=unsupported&status=retired&utm_source=bookmarks",
  ];
  const expected = [
    {query:"blue",sort:"year",status:"finished",minRating:0},
    {query:"green",sort:"rating",status:"planned",minRating:0},
    {query:"",sort:"rating",status:"all",minRating:0},
  ];
  for (const [index, href] of history.entries()) {
    const restored = readMediaQueryState(new URL(href, "https://www.peroniko.xyz").search);
    assert.deepEqual(restored, expected[index]);
    const rewritten = mediaFilterHref("https://www.peroniko.xyz" + href,
      restored.query, restored.sort, restored.status);
    const next = new URL(rewritten, "https://www.peroniko.xyz");
    assert.deepEqual(readMediaQueryState(next.search), restored);
    assert.equal(next.searchParams.get("utm_source"),
      index===1 ? null : "bookmarks");
    if (index===2) {
      assert.equal(next.searchParams.has("sort"), false);
      assert.equal(next.searchParams.has("status"), false);
    }
  }
});

test("half-star minimum rating URL state is canonical and safe",()=>{
  for(const value of ["0.5","1","1.5","2","2.5","3","3.5","4","4.5","5"]){
    assert.equal(readMediaQueryState("?min_rating="+value).minRating,Number(value));
  }
  for(const value of ["","0","-1","5.5","4.25","NaN","Infinity","1e2","0.0","003"]){
    assert.equal(readMediaQueryState("?min_rating="+encodeURIComponent(value)).minRating,0);
  }
  const href=mediaFilterHref("https://www.peroniko.xyz/films/?min_rating=invalid&min_rating=3&utm=public#rows",
    "","rating","finished",4.5);
  const url=new URL(href,"https://www.peroniko.xyz");
  assert.deepEqual(url.searchParams.getAll("min_rating"),["4.5"]);
  assert.equal(url.searchParams.get("utm"),"public");
  assert.equal(url.hash,"#rows");
  assert.equal(readMediaQueryState(url.search).minRating,4.5);
  assert.equal(mediaFilterHref(url.href,"","rating","all",0),"/films/?utm=public#rows");
});

test("missing provider IDs filter round-trips and rejects unsupported URL values",()=>{
  const url=mediaFilterHref("https://www.peroniko.xyz/music/?q=album&missing_id=bogus&source=bookmarks#list",
    "album","title","all",0,true);
  const parsed=new URL(url,"https://www.peroniko.xyz");
  assert.equal(parsed.searchParams.get("missing_id"),"1");
  assert.equal(parsed.searchParams.get("source"),"bookmarks");
  assert.equal(readMediaQueryState(parsed.search).missingRefsOnly,true);
  assert.equal(readMediaQueryState("?missing_id=TRUE").missingRefsOnly,false);
  assert.equal(readMediaQueryState("?missing_id=0").missingRefsOnly,false);
  assert.equal(mediaFilterHref(parsed.href,"","rating","all",0,false),"/music/?source=bookmarks#list");
});
