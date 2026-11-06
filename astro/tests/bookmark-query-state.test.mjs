import test from "node:test";
import assert from "node:assert/strict";
import { bookmarkFilterHref, readBookmarkQueryState } from "../src/lib/bookmark-query-state.ts";

const categories = ["Illustrations", "Research", "Videos"];

test("bookmark links restore only current categories, sort, and trimmed text", () => {
  assert.deepEqual(readBookmarkQueryState("?q=%20tagged%20&category=Research&sort=oldest", categories),
    {query:"tagged", category:"Research", sort:"oldest"});
  assert.deepEqual(readBookmarkQueryState("?q=&category=Removed&sort=invalid", categories),
    {query:"",category:"all",sort:"newest"});
  assert.deepEqual(readBookmarkQueryState("?category=Research&sort=title", ["Research"]),
    {query:"",category:"all",sort:"title"}, "A category-only page cannot show an invisible filter");
});

test("bookmark links preserve unrelated URL state and remove invalid duplicates", () => {
  const next = bookmarkFilterHref(
    "https://www.peroniko.xyz/search/?q=stale&q=ignored&category=missing&sort=invalid&utm_source=mail#results",
    {query:" new query ",category:"Research",sort:"title"});
  const parsed = new URL(next, "https://www.peroniko.xyz");
  assert.equal(parsed.pathname,"/search/");
  assert.equal(parsed.hash,"#results");
  assert.deepEqual(parsed.searchParams.getAll("q"),["new query"]);
  assert.equal(parsed.searchParams.get("category"),"Research");
  assert.equal(parsed.searchParams.get("sort"),"title");
  assert.equal(parsed.searchParams.get("utm_source"),"mail");
  const cleared = bookmarkFilterHref(parsed.href,{query:"",category:"all",sort:"newest"});
  const params = new URL(cleared,"https://www.peroniko.xyz").searchParams;
  assert.equal(params.has("q"),false);
  assert.equal(params.has("category"),false);
  assert.equal(params.has("sort"),false);
  assert.equal(params.get("utm_source"),"mail");
});

test("browser back/forward restores canonical query state through the same pure reader", () => {
  const old = "/sh/search/?q=old&sort=oldest";
  const next = bookmarkFilterHref("https://www.peroniko.xyz" + old,
    {query:"updated",category:"Videos",sort:"title"});
  assert.deepEqual(readBookmarkQueryState(old.split("?")[1],categories),
    {query:"old",category:"all",sort:"oldest"});
  assert.deepEqual(readBookmarkQueryState(new URL(next,"https://www.peroniko.xyz").search,categories),
    {query:"updated",category:"Videos",sort:"title"});
});
