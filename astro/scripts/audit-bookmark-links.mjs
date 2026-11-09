#!/usr/bin/env node
/** Manual-only: never run in the site build, GitHub Actions or browser runtime. */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { inspectDestination, MAX_LINKS_PER_RUN } from './link-health.mjs';

const ASTRO = fileURLToPath(new URL('../', import.meta.url));
const ROOT = resolve(ASTRO, '..');
const SOURCE = join(ROOT, 'content', 'bookmarks');
const OUTPUT = join(ASTRO, '.audit', 'bookmark-link-health.json');

function usage() {
  return `Read-only, opt-in bookmark link-health sampling (never part of CI or Pages publishing).\n\n` +
    `Usage: npm run audit:links -- --allow-network [--limit 1..${MAX_LINKS_PER_RUN}] [--offset N]\n` +
    `       npm run audit:links -- --allow-network --id Resource/worldwide_traffic_cameras\n\n` +
    `Default: 5 sorted published bookmarks. Writes a local ignored report to astro/.audit/\n` +
    `One page request plus robots.txt per checked host, with bounded bytes/time and no login.\n` +
    `No automatic fixes, issue comments, monitoring or external requests by visitors.\n`;
}

export function parseOptions(args) {
  if (args.includes('--help') || args.includes('-h')) return {help:true};
  const options = {limit:5,offset:0,id:null,allowNetwork:false};
  for (let i=0;i<args.length;i++) {
    const arg = args[i];
    if (arg === '--allow-network') options.allowNetwork = true;
    else if (arg === '--limit' || arg === '--offset' || arg === '--id') {
      if (i+1>=args.length) throw new Error(`Missing value for ${arg}`);
      const value = args[++i];
      if (arg === '--id') options.id = value;
      else {
        if (!/^\d+$/.test(value)) throw new Error(`${arg} must be an integer`);
        options[arg === '--limit' ? 'limit' : 'offset'] = Number(value);
      }
    } else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (!options.allowNetwork) throw new Error('Network requests are disabled by default; supply --allow-network explicitly.');
  if (!Number.isSafeInteger(options.limit) || options.limit<1 || options.limit>MAX_LINKS_PER_RUN) {
    throw new Error(`--limit must be between 1 and ${MAX_LINKS_PER_RUN}`);
  }
  if (!Number.isSafeInteger(options.offset) || options.offset<0) throw new Error('--offset must be nonnegative');
  if (options.id && (options.offset !== 0 || !/^[\p{L}\p{N}_-]+\/[\p{L}\p{N}_-]+$/u.test(options.id))) {
    throw new Error('--id must identify one Git-owned bookmark, and cannot be combined with --offset');
  }
  return options;
}

export async function readPublishedBookmarks(source=SOURCE) {
  const records = [];
  const categories = (await readdir(source,{withFileTypes:true})).filter(e=>e.isDirectory());
  for (const category of categories) {
    const files = (await readdir(join(source,category.name))).filter(name=>
      name.endsWith('.md') && name!=='_index.md').sort();
    for (const filename of files) {
      const text = await readFile(join(source,category.name,filename),'utf8');
      const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
      if (!frontmatter) throw new Error(`Missing frontmatter: ${category.name}/${filename}`);
      const data = parseYaml(frontmatter[1]);
      if (data?.draft === true) continue;
      if (typeof data?.title !== 'string' || !data.title.trim()) throw new Error(`Missing title: ${category.name}/${filename}`);
      records.push({ id:`${category.name}/${filename.slice(0,-3)}`, title:data.title,
        source:`content/bookmarks/${category.name}/${filename}`, url: typeof data.link === 'string' ? data.link : '' });
    }
  }
  return records.sort((a,b)=>a.id.localeCompare(b.id,'en'));
}

async function main() {
  let options;
  try { options = parseOptions(process.argv.slice(2)); }
  catch(error) { console.error(error.message+'\n\n'+usage()); process.exitCode=2; return; }
  if (options.help) { console.log(usage()); return; }
  const records = await readPublishedBookmarks();
  const selected = options.id ? records.filter(x=>x.id===options.id)
    : records.slice(options.offset,options.offset+options.limit);
  if (!selected.length) throw new Error('No published bookmarks found for the supplied selection');
  const checkedAt = new Date().toISOString();
  const results = [];
  const robotsCache = new Map();
  const lastVisitCache = new Map();
  for (const record of selected) {
    const result = await inspectDestination(record.url,{robotsCache,lastVisitCache});
    results.push({...record,checked_at:new Date().toISOString(),...result});
    console.log(`${record.id}: ${result.status}`);
    // Gentle sequential pacing, even if a target fails immediately.
    if (results.length < selected.length) await new Promise(done=>setTimeout(done,750));
  }
  await mkdir(join(ASTRO,'.audit'),{recursive:true});
  const report={schema:1,generated_at:checkedAt,mode:'manual-read-only',selection:{id:options.id,offset:options.offset,limit:selected.length},
    checked:results.length,results};
  await writeFile(OUTPUT,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(`Report: ${OUTPUT}\nFindings require independent review; nothing was changed on the website or in Git.`);
}

// Keep import safe for unit tests; CLI network activity requires an explicit flag.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(e=>{console.error(`Audit failed: ${e.message}`);process.exitCode=1;});
}
