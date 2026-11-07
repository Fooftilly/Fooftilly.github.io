import test from "node:test";
import assert from "node:assert/strict";
import { nextAvailableMediaPosition } from "../src/lib/media-editor-positions.ts";

test("readding a removed middle track uses the freed disc-relative position",()=>{
  const tracks=[{disc:1,number:1},{disc:1,number:2},{disc:1,number:3},
                {disc:2,number:1}];
  tracks.splice(1,1);
  assert.equal(nextAvailableMediaPosition(tracks.filter(x=>x.disc===1).map(x=>x.number),250),2);
  assert.equal(nextAvailableMediaPosition(tracks.filter(x=>x.disc===2).map(x=>x.number),250),2);
});

test("readding removed seasons or episodes avoids collisions",()=>{
  const seasons=[1,2,3];seasons.splice(1,1);
  assert.equal(nextAvailableMediaPosition(seasons,200),2);
  const episodes=[1,2,3];episodes.splice(0,1);
  assert.equal(nextAvailableMediaPosition(episodes,1000),1);
  assert.equal(nextAvailableMediaPosition(["1","02",3],1000),4);
});

test("position allocator reports an exhausted range instead of reusing a number",()=>{
  assert.equal(nextAvailableMediaPosition([1,2,4],4),3);
  assert.throws(()=>nextAvailableMediaPosition([1,2,3,4],4),/No available media position/);
});
