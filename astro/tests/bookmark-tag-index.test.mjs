import test from "node:test";
import assert from "node:assert/strict";
import { bookmarkTagCounts } from "../src/lib/bookmark-tag-index.ts";

test("tag directory counts only current public records, preserving first canonical source label",()=>{
  const records=[
    {tags:["Café","Music","music"]},
    {tags:["Cafe\u0301","Linux"]},
    {tags:["music","Linux"]},
    {tags:[]},
    {},
  ];
  assert.deepEqual(bookmarkTagCounts(records),[
    {label:"Café",count:2},
    {label:"Linux",count:2},
    {label:"Music",count:2},
  ]);
  assert.deepEqual(bookmarkTagCounts([]),[]);
  assert.deepEqual(bookmarkTagCounts([{tags:[]},{tags:undefined}]),[]);
});
test("tag index only uses supplied records and never mutates source metadata",()=>{
  const data=[{tags:["First"]},{tags:["Second"]}];
  const before=structuredClone(data);
  assert.deepEqual(bookmarkTagCounts(data),[{label:"First",count:1},{label:"Second",count:1}]);
  assert.deepEqual(data,before);
});
