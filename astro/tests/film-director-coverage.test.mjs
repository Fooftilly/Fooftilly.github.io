import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { filmDirectorCoverage, planDirectorProposals, directIdentities } from "../scripts/film-director-coverage.mjs";
import { parseFilmDirectorOptions, readFilmDirectorSources } from "../scripts/audit-film-directors.mjs";

const ref="2bf0";
const one={schema:1,kind:"films",title:"Cinderella",year:1922,refs:{letterboxd:ref},rating:4.5};
const two={schema:1,kind:"films",title:"Cinderella",year:1922,rating:2.5};
const multiple={schema:1,kind:"films",title:"Example Film",year:2006,refs:{imdb:"tt1234567"}};
const records=[
  {path:"content/media/films/cinderella-a.json",raw:one},
  {path:"content/media/films/cinderella-b.json",raw:two},
  {path:"content/media/films/example.json",raw:multiple},
  {path:"content/media/films/known.json",raw:{schema:1,kind:"films",title:"Known",year:1999,creator:"A Director"}},
];

test("counts only source-owned creator fields, preserving ambiguous works and missing identities",()=>{
  const result=filmDirectorCoverage([...records].reverse());
  assert.equal(result.summary.total,4);
  assert.equal(result.summary.with_creator,1);
  assert.equal(result.summary.missing_creator,3);
  assert.equal(result.summary.missing_with_direct_identity,2);
  assert.equal(result.summary.missing_without_direct_identity,1);
  assert.equal(result.summary.missing_with_letterboxd,1);
  assert.equal(result.summary.missing_with_imdb,1);
  assert.equal(result.summary.missing_with_tmdb,0);
  assert.equal(result.summary.ambiguous_title_year_groups,1);
  assert.equal(result.summary.ambiguous_title_year_records,2);
  assert.deepEqual(result.records.slice(0,2).map(r=>r.ambiguous_title_year),[true,true]);
  assert.equal(result.records[0].creator,null);
  assert.equal(result.records[0].identities[0].url,"https://boxd.it/"+ref);
  assert.equal(result.records[3].creator,"A Director");
  assert.throws(()=>filmDirectorCoverage([records[0],records[0]]),/duplicate/);
  assert.throws(()=>filmDirectorCoverage([{path:"content/media/tv/film.json",raw:one}]),/Invalid/);
  assert.throws(()=>filmDirectorCoverage([{path:"content/media/films/invalid.json",raw:{...one,kind:"tv"}}]),/kind differs/);
});

test("canonical direct links count as candidates, ordinary or search URLs do not",()=>{
  const identities=directIdentities({refs:{imdb:"tt1234567"},links:[
    {label:"TMDb",url:"https://www.themoviedb.org/movie/389"},
    {label:"BFI",url:"https://www.bfi.org.uk/films/whatever"},
    {label:"IMDb search",url:"https://www.imdb.com/find/?q=Example"},
  ]});
  assert.deepEqual(identities.map(x=>[x.platform,x.id]),[["imdb","tt1234567"],["tmdb","movie:389"]]);
});

test("review proposals require exact path AND canonical identity and permit multiple directors",()=>{
  const inventory=filmDirectorCoverage(records);
  const evidence=[
    {path:"content/media/films/example.json",identity:{platform:"imdb",id:"tt1234567"},
      directors:["Director One","Director Two"],evidence_url:"https://www.imdb.com/title/tt1234567/"},
  ];
  const proposals=planDirectorProposals(inventory,evidence);
  assert.deepEqual(proposals,[{
    path:"content/media/films/example.json",title:"Example Film",year:2006,
    proposed_creator:"Director One / Director Two",provider:"imdb",provider_id:"tt1234567",
    evidence_url:"https://www.imdb.com/title/tt1234567/",review_required:true,
  }]);
  assert.equal(inventory.records.find(x=>x.path.endsWith("example.json")).creator,null,
    "A review-only proposal must not mutate catalog records");
  assert.deepEqual(planDirectorProposals(inventory,[]),[],"No evidence means no guessed directors");
  assert.throws(()=>planDirectorProposals(inventory,[{title:"Cinderella",year:1922,directors:["Guess"]}]),/Unsupported director evidence entry/,
    "Title/year-only guesses must be rejected before any lookup");
  assert.throws(()=>planDirectorProposals(inventory,[{
    ...evidence[0],path:"content/media/films/not-a-source.json",
  }]),/No source film/);
  assert.throws(()=>planDirectorProposals(inventory,[{...evidence[0],identity:{platform:"imdb",id:"tt9999999"}}]),/exact source-owned/);
  assert.throws(()=>planDirectorProposals(inventory,[{...evidence[0],evidence_url:"https://example.org/guess"}]),/canonical URL/);
  assert.throws(()=>planDirectorProposals(inventory,[{...evidence[0],directors:["Director One","director one"]}]),/distinct/);
  assert.throws(()=>planDirectorProposals(inventory,[evidence[0],evidence[0]]),/Duplicate director evidence/);
  assert.throws(()=>planDirectorProposals(inventory,[{...evidence[0],path:"content/media/films/known.json"}]),/Existing director/);
  assert.throws(()=>planDirectorProposals(inventory,[{...evidence[0],path:"content/media/films/cinderella-b.json"}]),/exact source-owned/);
});

test("shared external identities fail closed rather than merging or guessing identities",()=>{
  const conflict=filmDirectorCoverage([...records,{
    path:"content/media/films/other.json",
    raw:{schema:1,kind:"films",title:"Another Edition",refs:{imdb:"tt1234567"}},
  }]);
  assert.throws(()=>planDirectorProposals(conflict,[{
    path:"content/media/films/example.json",identity:{platform:"imdb",id:"tt1234567"},
    directors:["Director"],evidence_url:"https://www.imdb.com/title/tt1234567/",
  }]),/shared by multiple/);
});

test("distinct provider IDs in refs and direct links remain visible and block unsafe proposals",()=>{
  const primary={
    schema:1,kind:"films",title:"Primary Film",year:2015,
    refs:{imdb:"tt1234567"},
  };
  const alternative={
    schema:1,kind:"films",title:"Another Film",year:2016,
    refs:{imdb:"tt7654321"},
    links:[{label:"IMDb alternative",url:"https://www.imdb.com/title/tt1234567/"}],
  };
  const coverage=filmDirectorCoverage([
    {path:"content/media/films/primary.json",raw:primary},
    {path:"content/media/films/alternative.json",raw:alternative},
  ]);
  const other=coverage.records.find(r=>r.path.endsWith("/alternative.json"));
  assert.deepEqual(other.identities.map(x=>x.id),["tt1234567","tt7654321"],
    "Do not discard different direct links simply because the platform already has a compact ID");
  assert.deepEqual(other.conflicting_provider_platforms,["imdb"]);
  assert.equal(coverage.summary.conflicting_provider_identity_records,1,
    "The report must flag records needing source identity reconciliation");
  assert.equal(coverage.summary.shared_provider_identity_groups,1,
    "The report must disclose the shared ref/link ID even before a proposal");
  assert.equal(coverage.summary.records_with_shared_provider_identity,2);
  assert.deepEqual(other.shared_provider_identities,[{
    platform:"imdb",id:"tt1234567",
    other_paths:["content/media/films/primary.json"],
  }]);
  assert.deepEqual(coverage.records.find(r=>r.path.endsWith("/primary.json")).shared_provider_identities,[{
    platform:"imdb",id:"tt1234567",
    other_paths:["content/media/films/alternative.json"],
  }]);
  assert.equal(coverage.summary.missing_with_direct_identity,2);

  // Previously an unrecorded shared direct link would let this proposal
  // pass, incorrectly treating tt1234567 as unique to the primary film.
  const primaryEvidence={
    path:"content/media/films/primary.json",
    identity:{platform:"imdb",id:"tt1234567"},
    directors:["Director One"],evidence_url:"https://www.imdb.com/title/tt1234567/",
  };
  assert.throws(()=>planDirectorProposals(coverage,[primaryEvidence]),/shared by multiple records/);
  // A conflicting ID *within* a single file must also be reconciled first.
  assert.throws(()=>planDirectorProposals(coverage,[{
    ...primaryEvidence,
    path:"content/media/films/alternative.json",
    identity:{platform:"imdb",id:"tt7654321"},
    evidence_url:"https://www.imdb.com/title/tt7654321/",
  }]),/Conflicting provider identities/);
  assert.deepEqual(directIdentities({
    refs:{imdb:"tt1234567"},
    links:[{label:"Direct duplicate",url:"https://www.imdb.com/title/tt1234567/"}],
  }).map(x=>x.id),["tt1234567"],"Exactly repeated IDs count once");
});

test("source file discovery ignores non-JSON files and the CLI is strictly local",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"peroniko-film-coverage-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,"extra"));
  await writeFile(join(dir,"b.json"),JSON.stringify(two));
  await writeFile(join(dir,"a.json"),JSON.stringify(one));
  await writeFile(join(dir,"notes.txt"),"ignored");
  const found=await readFilmDirectorSources(dir);
  assert.deepEqual(found.map(x=>x.path),[
    "content/media/films/a.json","content/media/films/b.json",
  ]);
  assert.deepEqual(parseFilmDirectorOptions(["--check"]),{check:true,report:false,evidence:null});
  assert.deepEqual(parseFilmDirectorOptions(["--report","--evidence","review.json"]),
    {check:false,report:true,evidence:"review.json"});
  assert.throws(()=>parseFilmDirectorOptions(["--check","--report"]),/read-only/);
  assert.throws(()=>parseFilmDirectorOptions(["--evidence","review.json"]),/requires --report/);
  assert.throws(()=>parseFilmDirectorOptions(["--network"]),/Unrecognized/);
});
