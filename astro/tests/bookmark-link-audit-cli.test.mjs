import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, readPublishedBookmarks } from '../scripts/audit-bookmark-links.mjs';

test('auditing requires explicit opt-in and enforces a ten-link ceiling',()=>{
  assert.throws(()=>parseOptions([]),/--allow-network/);
  assert.throws(()=>parseOptions(['--limit','10']),/--allow-network/);
  assert.throws(()=>parseOptions(['--allow-network','--limit','11']),/--limit must be between/);
  assert.throws(()=>parseOptions(['--allow-network','--limit','0']),/--limit must be between/);
  assert.throws(()=>parseOptions(['--allow-network','--offset','-1']),/integer/);
  assert.throws(()=>parseOptions(['--allow-network','--id','../../etc/passwd']),/--id must identify/);
  assert.throws(()=>parseOptions(['--allow-network','--id','Resource/example','--offset','2']),/--id must identify/);
  assert.throws(()=>parseOptions(['--allow-network','--unknown']),/Unexpected argument/);
  assert.deepEqual(parseOptions(['--allow-network','--limit','5','--offset','7']),{
    limit:5,offset:7,id:null,allowNetwork:true,
  });
  assert.equal(parseOptions(['--help']).help,true);
});

test('source sampling is read-only and discovers the confirmed discontinued bookmark',async()=>{
  const items=await readPublishedBookmarks();
  assert.ok(items.length > 0);
  const one=items.find(x=>x.id==='Resource/worldwide_traffic_cameras');
  assert.ok(one,'The verified example must come from the Git-owned published source');
  assert.equal(one.url,'https://trafficvision.live/');
  assert.equal(one.source,'content/bookmarks/Resource/worldwide_traffic_cameras.md');
  assert.equal(items.filter(x=>x.id===one.id).length,1);
});
