#!/usr/bin/env node
/** Offline only. Audit source coverage and optionally prepare review proposals.
 * Does not fetch provider APIs or edit Git-owned JSON, ratings, paths or Pages.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { filmDirectorCoverage, planDirectorProposals } from "./film-director-coverage.mjs";

const astro=fileURLToPath(new URL("../",import.meta.url));
const source=fileURLToPath(new URL("../../content/media/films/",import.meta.url));
const output=resolve(astro,".audit","film-director-coverage.json");

export function parseFilmDirectorOptions(args) {
  if(args.includes("--help"))return {help:true};
  const opts={check:false,report:false,evidence:null};
  for(let i=0;i<args.length;i++){
    if(args[i]==="--check")opts.check=true;
    else if(args[i]==="--report")opts.report=true;
    else if(args[i]==="--evidence" && args[i+1] && !args[i+1].startsWith("--"))
      opts.evidence=args[++i];
    else throw new Error("Unrecognized film-director audit option: "+args[i]);
  }
  if(opts.check && (opts.report||opts.evidence))
    throw new Error("--check is read-only and cannot be combined with --report or --evidence");
  if(opts.evidence&&!opts.report)
    throw new Error("--evidence requires --report to create local review proposals");
  return opts;
}

export async function readFilmDirectorSources(dir=source) {
  const names=(await readdir(dir)).filter(n=>n.endsWith(".json")).sort((a,b)=>a.localeCompare(b,"en"));
  return Promise.all(names.map(async name=>({
    path:"content/media/films/"+name,
    raw:JSON.parse(await readFile(resolve(dir,name),"utf8")),
  })));
}

async function main(){
  const options=parseFilmDirectorOptions(process.argv.slice(2));
  if(options.help){
    console.log("Offline film-director coverage: node scripts/audit-film-directors.mjs [--check | --report [--evidence path/to/reviewed-mappings.json]]");
    console.log("No provider requests, inferred directors, source JSON changes, or Pages publication.");
    return;
  }
  const coverage=filmDirectorCoverage(await readFilmDirectorSources());
  if(options.evidence){
    const evidence=JSON.parse(await readFile(resolve(options.evidence),"utf8"));
    coverage.proposed_changes=planDirectorProposals(coverage,evidence);
  }
  const s=coverage.summary;
  console.log("Film director source coverage: "+s.with_creator+"/"+s.total+" recorded; "+
    s.missing_creator+" missing. Missing with direct provider identity: "+
    s.missing_with_direct_identity+" (Letterboxd "+s.missing_with_letterboxd+
    ", IMDb "+s.missing_with_imdb+", TMDb "+s.missing_with_tmdb+
    "); without direct provider identity: "+s.missing_without_direct_identity+
    ". Ambiguous same-title/year groups: "+s.ambiguous_title_year_groups+
    " ("+s.ambiguous_title_year_records+" records).");
  console.log("Provider references are lookup candidates, not independently verified directors.");
  if(options.report){
    await mkdir(resolve(astro,".audit"),{recursive:true});
    await writeFile(output,JSON.stringify({generated_at:new Date().toISOString(),...coverage},null,2)+"\n",
      {mode:0o600});
    console.log("Local ignored report: "+output);
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  main().catch(e=>{console.error(e.message);process.exitCode=1;});
