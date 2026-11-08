import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMediaSearch, matchesMediaSearch, compareMediaListings, searchableMediaText, mediaNotesExplainSearch, matchesMediaStatus, mediaVisiblePage, MEDIA_PAGE_SIZE } from "../src/lib/media-browser.ts";

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

test("search indexes both displayed status labels and original status tokens",()=>{
  const entry={title:"Work",status:"in-progress"};
  assert.equal(matchesMediaSearch(searchableMediaText(entry),"In progress"),true);
  assert.equal(matchesMediaSearch(searchableMediaText(entry),"in-progress"),true);
});

test("status filtering distinguishes missing values from the three published statuses",()=>{
  const entries = [{status:"finished"},{status:"in-progress"},{status:"planned"},{}];
  for(const filter of ["all","finished","in-progress","planned","unspecified"]){
    const matched = entries.map((entry,index)=>matchesMediaStatus(entry,filter)?index:-1).filter(index=>index>=0);
    assert.deepEqual(matched,filter==="all"?[0,1,2,3]:[["finished","in-progress","planned","unspecified"].indexOf(filter)]);
  }
});

test("static media output retains complete source parity while hydrated lists page results",()=>{
  const entries=Array.from({length:127},(_,i)=>({id:"films/record-"+i,title:"Film "+i}));
  assert.equal(MEDIA_PAGE_SIZE,50);
  assert.equal(mediaVisiblePage(entries,MEDIA_PAGE_SIZE,false).length,127,
    "SSR must keep every source row for crawlers, non-JS visitors and audit parity");
  assert.deepEqual(mediaVisiblePage(entries,50,true).map(x=>x.id),entries.slice(0,50).map(x=>x.id));
  assert.deepEqual(mediaVisiblePage(entries,100,true).map(x=>x.id),entries.slice(0,100).map(x=>x.id));
  assert.deepEqual(mediaVisiblePage(entries,150,true).map(x=>x.id),entries.map(x=>x.id));
  assert.deepEqual(mediaVisiblePage(entries.slice(2,3),50,true),entries.slice(2,3));
  assert.deepEqual(mediaVisiblePage([],50,true),[]);
  assert.equal(entries.length,127,"Hydration must never mutate source records");
});

test("minimum rating selection includes unrated at default and excludes it for positive thresholds", async () => {
  const {matchesMediaMinimumRating} = await import("../src/lib/media-browser.ts");
  const entries=[{rating:5},{rating:4.5},{rating:3.5},{}];
  assert.deepEqual(entries.filter(x=>matchesMediaMinimumRating(x,0)),entries);
  assert.deepEqual(entries.filter(x=>matchesMediaMinimumRating(x,4.5)),entries.slice(0,2));
  assert.deepEqual(entries.filter(x=>matchesMediaMinimumRating(x,5)),entries.slice(0,1));
});


test("edition strings are searchable visible metadata rather than hidden notes",()=>{
  const item={title:"4 Sucessos",edition:"Part 2 EMI 07144",creator:"Kate Bush",year:1978,notes:"A note about part 1"};
  assert.equal(matchesMediaSearch(searchableMediaText(item),"07144"),true);
  assert.equal(matchesMediaSearch(searchableMediaText(item),"part 2"),true);
  assert.equal(mediaNotesExplainSearch(item,"07144"),false);
  assert.equal(mediaNotesExplainSearch(item,"note"),true);
  assert.equal(mediaNotesExplainSearch(item,"part 2"),false);
});
