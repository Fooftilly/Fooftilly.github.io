import test from "node:test";
import assert from "node:assert/strict";
import { parseBookmarkTags, validateBookmarkTags } from "../src/lib/bookmark-tags.ts";

test("optional public tags are content-defined and Unicode-safe",()=>{
  assert.deepEqual(parseBookmarkTags(""),[]);
  assert.deepEqual(parseBookmarkTags("  Café culture, web design  "),["Café culture","web design"]);
  assert.deepEqual(parseBookmarkTags("Cafe\u0301"),["Café"]);
});
test("invalid, duplicate and oversized tags are not silently discarded",()=>{
  for (const value of ["one,,two","tag, TAG","foo,foo","a".repeat(37),"bad\nname"]) {
    assert.throws(()=>parseBookmarkTags(value),/Tags|Duplicate/);
  }
  assert.throws(()=>validateBookmarkTags(Array.from({length:13},(_,i)=>"tag"+i)),/at most 12/);
  assert.deepEqual(validateBookmarkTags(["Mutable","Categories"]),["Mutable","Categories"]);
});

test("browser locale must not affect duplicate detection in source and editor", () => {
  assert.throws(() => parseBookmarkTags("I, i"), /Duplicate bookmark tag/);
  assert.throws(() => validateBookmarkTags(["I","i"]), /Duplicate bookmark tag/);
  assert.deepEqual(validateBookmarkTags(["İ","i"]), ["İ","i"]);
  assert.deepEqual(validateBookmarkTags([]), [], "Empty source tag lists remain valid");
  assert.throws(() => validateBookmarkTags(["Café","Cafe\u0301"]), /Duplicate bookmark tag/,
    "Composed and decomposed equivalents must have the same identity");
});

test("suggestions are derived from supplied published records and ordered by usage", async () => {
  const { bookmarkTagSuggestions } = await import("../src/lib/bookmark-tags.ts");
  const records=[
    {tags:["Café culture", "Music"]}, {tags:["Cafe\u0301 culture"]},
    {tags:["music", "Photography"]}, {tags:["Music"]}, {},
  ];
  assert.deepEqual(bookmarkTagSuggestions(records),["Music","Café culture","Photography"]);
  assert.deepEqual(bookmarkTagSuggestions([]),[]);
  assert.deepEqual(bookmarkTagSuggestions([{tags:[]}]),[]);
});

test("selecting a suggested tag after a trailing comma finishes a valid list", async () => {
  const {appendBookmarkTag} = await import("../src/lib/bookmark-tags.ts");
  assert.equal(appendBookmarkTag("Research, ", "Git-owned"), "Research, Git-owned");
  assert.equal(appendBookmarkTag("Research,", "Café culture"), "Research, Café culture");
  assert.equal(appendBookmarkTag("", "Music"), "Music");
  assert.throws(() => appendBookmarkTag("one,,two", "three"), /Tags/);
  assert.throws(() => appendBookmarkTag("Research", "research"), /Duplicate/);
});
