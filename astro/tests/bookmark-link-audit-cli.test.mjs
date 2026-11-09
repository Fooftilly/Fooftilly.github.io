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

test('source discovery uses current content and honors drafts without a historical identity gate',async t=>{
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root=await mkdtemp(join(tmpdir(),'peroniko-link-health-source-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const category=join(root,'Resource');
  await mkdir(category);
  const yaml=(title,url,extra='')=>[
    '---',
    'title: '+JSON.stringify(title),
    'link: '+JSON.stringify(url),
    extra,
    '---',
    '',
  ].join('\n');
  await writeFile(join(category,'current.md'),yaml('Current example','https://example.org/'));
  await writeFile(join(category,'hidden.md'),yaml('Draft example','https://example.org/draft','draft: true'));
  await writeFile(join(category,'_index.md'),yaml('Category index','https://example.org/index'));
  const first=await readPublishedBookmarks(root);
  assert.deepEqual(first,[{
    id:'Resource/current',title:'Current example',
    source:'content/bookmarks/Resource/current.md',url:'https://example.org/',
  }]);
  await writeFile(join(category,'renamed.md'),yaml('Edited example','https://example.org/edited'));
  await rm(join(category,'current.md'));
  const second=await readPublishedBookmarks(root);
  assert.deepEqual(second,[{
    id:'Resource/renamed',title:'Edited example',
    source:'content/bookmarks/Resource/renamed.md',url:'https://example.org/edited',
  }]);
  const current=await readPublishedBookmarks();
  assert.ok(current.length>0,'There must be a current published inventory');
  assert.equal(new Set(current.map(entry=>entry.id)).size,current.length);
  assert.ok(current.every(entry=>entry.source==='content/bookmarks/'+entry.id+'.md'));
});
