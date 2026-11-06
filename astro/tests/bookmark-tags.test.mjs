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
