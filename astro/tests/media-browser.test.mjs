import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaSearch, matchesMediaSearch, compareMediaListings, searchableMediaText, mediaNotesExplainSearch, matchesMediaStatus } from "../src/lib/media-browser.ts";

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

test("search indexes public media fields, not unrelated external reference labels",()=>{
  const item={title:"Moonrise",creator:"Émilie",year:2005,status:"finished",
    notes:"Watched after sunset.",links:[{label:"Jazz reviews",url:"https://example.org/"}]};
  const text=searchableMediaText(item);
  assert.equal(matchesMediaSearch(text,"jazz"),false);
  assert.equal(matchesMediaSearch(text,"emilie sunset"),true);
  assert.equal(matchesMediaSearch(text,"2005 moonrise"),true);
});

test("matching terms found only in collapsed public notes are revealed", () => {
  const entry = { title: "CI synthetic film", id: "films/example", creator: "Émilie",
    year: 2001, status: "finished", notes: "Synthetic note.\\nSecond paragraph." };
  assert.equal(mediaNotesExplainSearch(entry, "second"), true,
    "Note-only searches should expand the note containing the matching text");
  assert.equal(mediaNotesExplainSearch(entry, "FILM second"), true,
    "Mixed visible-metadata and note queries should reveal the note");
  assert.equal(mediaNotesExplainSearch(entry, "émilie paragráph"), true,
    "Accent-insensitive searches should reveal note text");
  assert.equal(mediaNotesExplainSearch(entry, "ci film"), false,
    "Title-only searches should leave notes collapsed");
  assert.equal(mediaNotesExplainSearch(entry, "émilie"), false,
    "Creator-only searches should leave notes collapsed");
  assert.equal(mediaNotesExplainSearch(entry, "synthetic"), false,
    "A visible match does not require expanding notes even when the note also matches");
  assert.equal(mediaNotesExplainSearch(entry, "second nonexistent"), false,
    "No nonmatching result should be marked for note disclosure");
  assert.equal(mediaNotesExplainSearch(entry, "   "), false,
    "Blank searches keep normal compact table presentation");
  assert.equal(mediaNotesExplainSearch({...entry,notes:undefined}, "second"), false);
});

test("status filtering distinguishes missing values from the three published statuses",()=>{
  const entries = [{status:"finished"},{status:"in-progress"},{status:"planned"},{}];
  for(const filter of ["all","finished","in-progress","planned","unspecified"]){
    const matched = entries.map((entry,index)=>matchesMediaStatus(entry,filter)?index:-1).filter(index=>index>=0);
    assert.deepEqual(matched,filter==="all"?[0,1,2,3]:[["finished","in-progress","planned","unspecified"].indexOf(filter)]);
  }
});
