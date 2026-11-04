import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseRatingsCsv, validateRatingsCatalog } from "../src/lib/ratings.ts";

const musicHeader = "RYM Album,First Name,Last Name,First Name localized,Last Name localized,Title,Release_Date,Rating,Ownership,Purchase Date,Media Type,Review";

test("RYM's 0–10 integer export uses half-star values; private review fields never leak", () => {
  const csv = [
    musicHeader,
    '101,The,Beatles,,,"A Title, with comma",1969,7,n,,Vinyl,"Private, unpublished review"',
    '102,,김정미,,Kim Jung Mi,Now,1973,10,n,,,',
    '103,,Another Artist,,,An unrated album,1987,,n,,,',
  ].join("\r\n");
  const catalog = parseRatingsCsv("\uFEFF" + csv, "music");
  assert.equal(catalog.source, "Rate Your Music");
  assert.equal(catalog.items.length, 2);
  assert.deepEqual(catalog.items[0], { id: "102", title: "Now", rating: 5, artist: "김정미", year: 1973 });
  assert.deepEqual(catalog.items[1], { id: "101", title: "A Title, with comma", rating: 3.5, artist: "The Beatles", year: 1969 });
  assert.ok(!JSON.stringify(catalog).includes("Private, unpublished"));
  assert.ok(!JSON.stringify(catalog).includes("Vinyl"));
});

test("RYM film exports use the same normalized scale, optional director/year and no invented links", () => {
  const catalog = parseRatingsCsv([
    "RYM Film,Title,Director,Release_Date,Rating",
    "201,The Film,Someone,1984,8",
    "202,Another Film,,1997,1",
  ].join("\n"), "films");
  assert.deepEqual(catalog.items, [
    { id: "201", title: "The Film", rating: 4, artist: "Someone", year: 1984 },
    { id: "202", title: "Another Film", rating: 0.5, year: 1997 },
  ]);
});

test("Letterboxd film export preserves valid links and half-star ratings", () => {
  const catalog = parseRatingsCsv([
    "Date,Name,Year,Letterboxd URI,Rating",
    "2026-11-01,\"Film, A\",1984,https://letterboxd.com/film/film-a/,4.5",
  ].join("\n"), "films", "letterboxd");
  assert.equal(catalog.source, "Letterboxd");
  assert.deepEqual(catalog.items, [
    { id: "https://letterboxd.com/film/film-a/", title: "Film, A", rating: 4.5,
      year: 1984, url: "https://letterboxd.com/film/film-a/" },
  ]);
});

test("quoted multiline CSV is handled, and broken quoting or column counts fail closed", () => {
  assert.deepEqual(parseCsv('Title,Review\n"Film, A","First line\nSecond ""quoted"" line"'), [
    ["Title", "Review"], ["Film, A", 'First line\nSecond "quoted" line'],
  ]);
  assert.throws(() => parseCsv('Title,Review\n"Unclosed,review'), /Unterminated/);
  assert.throws(() => parseCsv('Title,Review\n"Closed"x,review'), /Unexpected character/);
  assert.throws(() => parseRatingsCsv("Title,Rating\nFilm,4,unexpected", "films"), /columns, expected/);
  assert.throws(() => parseRatingsCsv("Title,Title,Rating\nA,B,5", "films"), /Duplicate or empty/);
});

test("importers reject invalid scores, unsafe source links, duplicates, empty catalog and mismatched types", () => {
  assert.throws(() => parseRatingsCsv("Title,Rating\nA,11", "films"), /row 2: RYM rating/);
  assert.throws(() => parseRatingsCsv("Title,Rating\nA,4.5", "films"), /RYM rating/);
  assert.throws(() => parseRatingsCsv("Name,Rating\nA,6", "films", "letterboxd"), /Letterboxd rating/);
  assert.throws(() => parseRatingsCsv("Name,Rating,Letterboxd URI\nA,4,javascript:alert(1)", "films", "letterboxd"), /Unsupported external URL/);
  assert.throws(() => parseRatingsCsv("Name,Rating,Letterboxd URI\nA,4,https://evil.example/", "films", "letterboxd"), /Unsupported external URL/);
  assert.throws(() => parseRatingsCsv("RYM Film,Title,Rating\n1,A,6\n1,A,7", "films"), /Duplicate rated item/);
  assert.throws(() => parseRatingsCsv("Title,Rating\nA,", "films"), /no rated items/);
  assert.throws(() => parseRatingsCsv("Title,Rating\nA,8", "music"), /missing artist columns/);
  assert.throws(() => parseRatingsCsv("Name,Rating\nA,4", "music", "letterboxd"), /Music import requires/);
  assert.throws(() => validateRatingsCatalog({schema: 1,kind:"music",source:"Rate Your Music",items: [
    {id:"1",title:"A",rating:6},
  ]}, "music"), /Rating outside/);
  assert.throws(() => validateRatingsCatalog({schema: 1,kind:"films",source:"Rate Your Music",items: []}, "music"), /Invalid ratings catalog/);
});

test("empty published catalogs are explicit and valid until the owner exports actual ratings", () => {
  for (const kind of ["music", "films"]) {
    assert.deepEqual(validateRatingsCatalog({ schema: 1, kind, source: "Rate Your Music", items: [] }, kind).items, []);
  }
});
