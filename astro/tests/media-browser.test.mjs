import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaSearch, matchesMediaSearch, compareMediaListings } from "../src/lib/media-browser.ts";

test("media search is case- and accent-insensitive across visible table fields",()=>{
  assert.equal(normalizeMediaSearch("  CAFÉ\t Émilie "), "cafe emilie");
  assert.equal(matchesMediaSearch("Café album, Émilie, 2020, finished, personal notes", "EMILIE  cafe"),true);
  assert.equal(matchesMediaSearch("Film One, 2001, planned", "film 2001"),true);
  assert.equal(matchesMediaSearch("Film One, 2001, planned", "film 2002"),false);
  assert.equal(matchesMediaSearch("A title", "    "),true);
});

test("rating and year sort leave unlisted values last and tie-break by title",()=>{
  const items = [
    {title:"Zero",id:"z"},
    {title:"Café",id:"b",rating:4,year:2000},
    {title:"A Film",id:"a",rating:5,year:2010},
    {title:"Beta",id:"c",rating:4,year:2024},
  ];
  const order = (kind) => [...items].sort((a,b)=>compareMediaListings(a,b,kind)).map(x=>x.title);
  assert.deepEqual(order("rating"),["A Film","Beta","Café","Zero"]);
  assert.deepEqual(order("year"),["Beta","A Film","Café","Zero"]);
  assert.deepEqual(order("title"),["A Film","Beta","Café","Zero"]);
});
