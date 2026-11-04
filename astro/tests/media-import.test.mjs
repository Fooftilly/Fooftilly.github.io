import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseCsv, parseMediaCsv } from "../src/lib/media-import.ts";
import { mediaPath } from "../src/lib/media-model.ts";

const rym = [
  "RYM Album,First Name,Last Name,Title,Release_Date,Rating,Review,Ownership",
  '1,The,Artist,"A  Record, with comma",1978,7,"A private, quoted review",Vinyl',
  "2,,New Artist,Another Record,1981,10,,",
  "3,,No Artist,Unrated,1982,0,,",
].join("\r\n");

test("RYM rated music uses source-independent 0.5–5 stars and discards private fields",()=>{
  const items=parseMediaCsv("\uFEFF"+rym,"music","rym");
  assert.equal(items.length,2);
  assert.equal(items[0].rating,3.5);
  assert.equal(items[1].rating,5);
  assert.equal(items[0].creator,"The Artist");
  assert.equal(items[0].title,"A  Record, with comma");
  assert.equal(mediaPath(items[0]),"content/media/music/a-record-with-comma-1978-the-artist.json");
  assert.ok(!JSON.stringify(items).includes("private"));
  assert.ok(!JSON.stringify(items).includes("Vinyl"));
  assert.equal(items[0].status,"finished");
  assert.equal(items[0].links,undefined);
});

test("Letterboxd film CSV is normalized to same first-party record",()=>{
  const csv=[
    "Date,Name,Year,Letterboxd URI,Rating",
    '2026-11-01,"Film, One",1991,https://letterboxd.com/film/film-one/,4.5',
  ].join("\n");
  const [item]=parseMediaCsv(csv,"films","letterboxd");
  assert.equal(item.title,"Film, One");
  assert.equal(item.year,1991);
  assert.equal(item.rating,4.5);
  assert.deepEqual(item.links,[{label:"Letterboxd",url:"https://letterboxd.com/film/film-one/"}]);
  assert.equal(mediaPath(item),"content/media/films/film-one-1991.json");
});

test("RYM film CSV handles ratings and optional metadata",()=>{
  const csv="RYM Film,Title,Director,Release_Date,Rating\n12,Film A,Director A,1988,8\n13,Film B,,1990,5";
  const items=parseMediaCsv(csv,"films","rym");
  assert.deepEqual(items.map(x=>x.rating),[4,2.5]);
});

test("CSV quotes, malformed encoding, collisions and external URL injections fail closed",()=>{
  assert.deepEqual(parseCsv('a,b\n"One, Two","Text\nwith ""quotes"""'),[
    ["a","b"],["One, Two",'Text\nwith "quotes"']
  ]);
  assert.throws(()=>parseCsv('a,b\n"missing closing,b'),/Unterminated quoted/);
  assert.throws(()=>parseMediaCsv("Title,Rating\nBad,11","films","rym"),/RYM score/);
  assert.throws(()=>parseMediaCsv("Name,Rating\nBad,6","films","letterboxd"),/Letterboxd score/);
  assert.throws(()=>parseMediaCsv("Title,Rating\nX,4","music","rym"),/Artist or Last Name/);
  assert.throws(()=>parseMediaCsv("Name,Year,Rating,Letterboxd URI\nA,2010,4,javascript:alert(1)","films","letterboxd"),/Only absolute HTTP/);
  assert.throws(()=>parseMediaCsv("Name,Year,Rating,Letterboxd URI\nA,2010,4,https://untrusted.example/","films","letterboxd"),/another domain/);
  assert.throws(()=>parseMediaCsv("RYM Film,Title,Rating\n1,A,8\n2,A,9","films","rym"),/Duplicate media entry/);
  assert.throws(()=>parseMediaCsv("RYM Film,Title,Rating\n1,Unrated,0","films","rym"),/no rated items/);
  assert.throws(()=>parseMediaCsv("Title,Rating\nX,5","tv","rym"),/manual website editor/);
});

test("offline importer defaults to preview and rejects invalid UTF-8 without writing",async()=>{
  const folder=await mkdtemp(join(tmpdir(),"media-import-test-"));
  try{
    const csv=join(folder,"export.csv");
    const script=fileURLToPath(new URL("../scripts/import-media.mjs",import.meta.url));
    await writeFile(csv,rym);
    const preview=spawnSync(process.execPath,[script,"music",csv,"rym"],{encoding:"utf8"});
    assert.equal(preview.status,0,preview.stderr);
    assert.match(preview.stdout,/Preview only/);
    assert.match(preview.stdout,/2 new records/);
    const invalid=join(folder,"windows-1252.csv");
    await writeFile(invalid,Buffer.from([0x52,0x59,0x4d,0x20,0x41,0x6c,0x62,0x75,0x6d,0x0a,0xe9]));
    const error=spawnSync(process.execPath,[script,"music",invalid,"rym"],{encoding:"utf8"});
    assert.notEqual(error.status,0);
    assert.match(error.stderr,/encoded data was not valid|utf-8|invalid.*encoding/i);
  }finally{await rm(folder,{recursive:true,force:true});}
});
