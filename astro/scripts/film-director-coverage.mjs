/** Offline, deterministic director-coverage inventory. Never guesses directors or
 * contacts providers. Git-owned film JSON remains the source of truth.
 */
import { mediaReferenceFromUrl, mediaReferenceUrl, validateMediaRecord } from "../src/lib/media-model.ts";

const pathPattern=/^content\/media\/films\/[\p{L}\p{N}_.-]+\.json$/u;
const directPlatforms=new Set(["letterboxd","imdb","tmdb"]);
const normalizeTitle=title=>title.normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();

export function directIdentities(record) {
  const ids=new Map();
  for(const [platform,id] of Object.entries(record.refs??{}))
    if(directPlatforms.has(platform))ids.set(platform,id);
  for(const link of record.links??[]) {
    const parsed=mediaReferenceFromUrl(link.url);
    if(parsed && directPlatforms.has(parsed.platform) && !ids.has(parsed.platform))
      ids.set(parsed.platform,parsed.id);
  }
  return [...ids].sort(([a],[b])=>a.localeCompare(b,"en"))
    .map(([platform,id])=>({platform,id,url:mediaReferenceUrl(platform,id)}));
}

export function filmDirectorCoverage(files) {
  const paths=new Set();
  const records=files.map(({path,raw})=>{
    if(typeof path!=="string" || !pathPattern.test(path) || paths.has(path))
      throw new Error("Invalid or duplicate film source path: "+path);
    paths.add(path);
    const record=validateMediaRecord(raw,"films");
    return {
      path,title:record.title,year:record.year??null,edition:record.edition??null,
      creator:record.creator??null, identities:directIdentities(record),
      ambiguous_title_year:false,
    };
  }).sort((a,b)=>a.path.localeCompare(b.path,"en"));
  const byTitle=new Map();
  for(const record of records) {
    const key=normalizeTitle(record.title)+"\u0000"+(record.year??"unknown");
    const set=byTitle.get(key)??[];
    set.push(record);
    byTitle.set(key,set);
  }
  const ambiguous= [...byTitle.values()].filter(set=>set.length>1);
  for(const group of ambiguous)
    for(const record of group)record.ambiguous_title_year=true;
  const missing=records.filter(r=>!r.creator);
  const countPlatform=platform=>missing.filter(r=>r.identities.some(x=>x.platform===platform)).length;
  const summary={
    total:records.length,
    with_creator:records.length-missing.length,
    missing_creator:missing.length,
    missing_with_direct_identity:missing.filter(r=>r.identities.length>0).length,
    missing_without_direct_identity:missing.filter(r=>r.identities.length===0).length,
    missing_with_letterboxd:countPlatform("letterboxd"),
    missing_with_imdb:countPlatform("imdb"),
    missing_with_tmdb:countPlatform("tmdb"),
    ambiguous_title_year_groups:ambiguous.length,
    ambiguous_title_year_records:ambiguous.reduce((sum,g)=>sum+g.length,0),
  };
  return {schema:1,summary,records};
}

/** Review-only proposal: requires an existing exact provider ID AND file path.
 * A title/year match is deliberately insufficient (e.g. Cinderella 1922).
 * The evidence URL is a pointer for human verification, never an assertion
 * that a provider has actually been checked or that a director is correct.
 */
export function planDirectorProposals(coverage,evidence) {
  if(!Array.isArray(evidence))throw new Error("Evidence must be an array");
  const byPath=new Map(coverage.records.map(item=>[item.path,item]));
  const used=new Set();
  const proposals=[];
  for(const item of evidence) {
    if(!item || typeof item!=="object" || Array.isArray(item) ||
       Object.keys(item).some(k=>!["path","identity","directors","evidence_url"].includes(k)))
      throw new Error("Unsupported director evidence entry");
    const record=byPath.get(item.path);
    if(!record)throw new Error("No source film for evidence path: "+item.path);
    if(used.has(record.path))throw new Error("Duplicate director evidence for "+record.path);
    used.add(record.path);
    if(record.creator)throw new Error("Existing director cannot be overwritten: "+record.path);
    const platform=item.identity?.platform;
    const id=item.identity?.id;
    const expected=record.identities.find(x=>x.platform===platform && x.id===id);
    if(!expected || item.evidence_url!==expected.url)
      throw new Error("Director evidence must match an exact source-owned provider ID and canonical URL: "+record.path);
    if(coverage.records.filter(other=>other.identities.some(x=>x.platform===platform&&x.id===id)).length!==1)
      throw new Error("Director provider identity is shared by multiple records: "+record.path);
    if(!Array.isArray(item.directors) || !item.directors.length || item.directors.length>8 ||
       item.directors.some(x=>typeof x!=="string"||!x.trim()) ||
       new Set(item.directors.map(x=>x.normalize("NFC").trim().toLowerCase())).size!==item.directors.length)
      throw new Error("Provide one to eight distinct, named directors");
    const creator=item.directors.map(x=>x.normalize("NFC").trim()).join(" / ");
    validateMediaRecord({schema:1,kind:"films",title:record.title,creator},"films");
    proposals.push({
      path:record.path,title:record.title,year:record.year,
      proposed_creator:creator,provider:platform,provider_id:id,
      evidence_url:expected.url,review_required:true,
    });
  }
  return proposals.sort((a,b)=>a.path.localeCompare(b.path,"en"));
}
