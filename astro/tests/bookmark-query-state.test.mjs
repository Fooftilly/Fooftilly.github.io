import test from "node:test";
import assert from "node:assert/strict";
import { bookmarkFilterHref, bookmarkTagSearchHref, readBookmarkQueryState } from "../src/lib/bookmark-query-state.ts";

const categories = ["Illustrations", "Research", "Videos"];

test("bookmark links restore only current categories, sort, and trimmed text", () => {
  assert.deepEqual(readBookmarkQueryState("?q=%20tagged%20&category=Research&sort=oldest", categories),
    {query:"tagged", category:"Research", sort:"oldest",tag:""});
  assert.deepEqual(readBookmarkQueryState("?q=&category=Removed&sort=invalid", categories),
    {query:"",category:"all",sort:"newest",tag:""});
  assert.deepEqual(readBookmarkQueryState("?category=Research&sort=title", ["Research"]),
    {query:"",category:"all",sort:"title",tag:""}, "A category-only page cannot show an invisible filter");
});

test("bookmark links preserve unrelated URL state and remove invalid duplicates", () => {
  const next = bookmarkFilterHref(
    "https://www.peroniko.xyz/search/?q=stale&q=ignored&category=missing&sort=invalid&utm_source=mail#results",
    {query:" new query ",category:"Research",sort:"title",tag:""});
  const parsed = new URL(next, "https://www.peroniko.xyz");
  assert.equal(parsed.pathname,"/search/");
  assert.equal(parsed.hash,"#results");
  assert.deepEqual(parsed.searchParams.getAll("q"),["new query"]);
  assert.equal(parsed.searchParams.get("category"),"Research");
  assert.equal(parsed.searchParams.get("sort"),"title");
  assert.equal(parsed.searchParams.get("utm_source"),"mail");
  const cleared = bookmarkFilterHref(parsed.href,{query:"",category:"all",sort:"newest",tag:""});
  const params = new URL(cleared,"https://www.peroniko.xyz").searchParams;
  assert.equal(params.has("q"),false);
  assert.equal(params.has("category"),false);
  assert.equal(params.has("sort"),false);
  assert.equal(params.get("utm_source"),"mail");
});

test("browser back/forward restores canonical query state through the same pure reader", () => {
  const old = "/sh/search/?q=old&sort=oldest";
  const next = bookmarkFilterHref("https://www.peroniko.xyz" + old,
    {query:"updated",category:"Videos",sort:"title",tag:""});
  assert.deepEqual(readBookmarkQueryState(old.split("?")[1],categories),
    {query:"old",category:"all",sort:"oldest",tag:""});
  assert.deepEqual(readBookmarkQueryState(new URL(next,"https://www.peroniko.xyz").search,categories),
    {query:"updated",category:"Videos",sort:"title",tag:""});
});

test("tag links select only current labels and survive history changes", () => {
  const tags=["Café culture","Git-owned"];
  const restored=readBookmarkQueryState("?tag=Cafe%CC%81+culture&q=article",categories,tags);
  assert.deepEqual(restored,{query:"article",category:"all",sort:"newest",tag:"Café culture"});
  assert.equal(readBookmarkQueryState("?tag=retired",categories,tags).tag,"");
  const target=bookmarkTagSearchHref("Café culture","sh");
  assert.equal(target,"/sh/search/?tag=Caf%C3%A9+culture");
  const next=bookmarkFilterHref("https://www.peroniko.xyz"+target+"&campaign=old",
    {query:"",category:"all",sort:"newest",tag:"Git-owned"});
  const url=new URL(next,"https://www.peroniko.xyz");
  assert.equal(url.searchParams.get("tag"),"Git-owned");
  assert.equal(url.searchParams.get("campaign"),"old");
  const cleared=bookmarkFilterHref(url.href,{query:"",category:"all",sort:"newest",tag:""});
  assert.equal(new URL(cleared,"https://www.peroniko.xyz").searchParams.has("tag"),false);
});
