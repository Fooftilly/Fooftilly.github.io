import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMediaRecord, mediaSlug, mediaPath, composeMediaDraft,
  sameMedia, githubMediaEditorUrl, mediaEntryId, assertUniqueMediaCatalog, mediaSourceLabel,
  mediaReferenceUrl, mediaReferenceFromUrl, mediaSourceLinks, compactMediaLinks,
  composeMediaReferenceEdit, composeMediaRatingsEdit, githubExistingMediaEditorUrl,
} from "../src/lib/media-model.ts";

const film = {
  schema: 1, kind: "films", title: "An  Important Film", creator: "Émilie Director",
  year: 2023, rating: 3.5, status: "finished", notes: "My public note.",
  links: [{label:"Letterboxd",url:"https://letterboxd.com/film/important/"}],
};

test("site-owned records round-trip without RYM or Letterboxd identifiers", () => {
  const record = validateMediaRecord(film, "films");
  assert.equal(record.title, film.title);
  assert.equal(record.rating, 3.5);
  assert.equal(mediaSlug(record), "an-important-film-2023-emilie-director");
  const draft = composeMediaDraft(record, []);
  assert.equal(draft.path, "content/media/films/an-important-film-2023-emilie-director.json");
  assert.deepEqual(JSON.parse(draft.json), record);
  const url = new URL(githubMediaEditorUrl(draft.path,draft.json));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.searchParams.get("filename"),draft.path);
  assert.equal(url.searchParams.get("value"),draft.json);
  assert.equal(draft.duplicatePaths.length,0);
});

test("film/TV/music records accept no ratings and independent public references", () => {
  for(const kind of ["music","films","tv"]){
    const record=validateMediaRecord({schema:1,kind,title:"A title",status:"planned"});
    assert.equal(record.rating,undefined);
    assert.equal(mediaPath(record), "content/media/"+kind+"/a-title.json");
  }
  assert.equal(validateMediaRecord({
    schema:1,kind:"music",title:"An Album",
    links:[{label:"Author's website",url:"https://example.org/music/"}],
  }).links[0].url,"https://example.org/music/");
});

test("album track ratings preserve disc positions and never inherit album scores",()=>{
  const album=validateMediaRecord({schema:1,kind:"music",title:"The Album",rating:4,
    tracks:[{disc:1,number:1,title:"Opening",rating:4.5},
            {disc:1,number:2,title:"Second"},
            {disc:2,number:1,title:"Closing",rating:3}]});
  assert.equal(album.rating,4);
  assert.deepEqual(album.tracks.map(track=>track.rating),[4.5,undefined,3]);
  assert.deepEqual(JSON.parse(composeMediaDraft(album,[]).json).tracks,album.tracks);
  assert.throws(()=>validateMediaRecord({...album,
    tracks:[{disc:1,number:1,title:"First"},{disc:1,number:1,title:"Other"}]}),
    /Duplicate track position/);
  assert.throws(()=>validateMediaRecord({...album,tracks:[{disc:0,number:1,title:"Invalid"}]}),/Disc/);
  assert.throws(()=>validateMediaRecord({...album,tracks:[{disc:1,number:1,title:"X",rating:3.3}]}),/Track rating/);
  assert.throws(()=>validateMediaRecord({...film,tracks:album.tracks}),/Tracks apply to music/);
});

test("TV/anime season and episode scores are independent with distinct numbering",()=>{
  const series=validateMediaRecord({schema:1,kind:"tv",title:"Anime",rating:4,
    seasons:[{number:0,title:"Specials",episodes:[{number:1,title:"OVA",rating:4.5}]},
             {number:1,rating:3.5,episodes:[{number:1,title:"Pilot",rating:5},
               {number:2,title:"Follow-up"}]},
             {number:2}]});
  assert.equal(series.seasons[0].episodes[0].rating,4.5);
  assert.equal(series.seasons[1].episodes[1].rating,undefined);
  assert.equal(series.seasons[2].rating,undefined);
  assert.equal(series.rating,4);
  assert.throws(()=>validateMediaRecord({...series,seasons:[{number:1},{number:1}]}),/Duplicate season/);
  assert.throws(()=>validateMediaRecord({...series,seasons:[{number:1,episodes:[
    {number:1},{number:1}]}]}),/Duplicate episode/);
  assert.throws(()=>validateMediaRecord({...series,seasons:[{number:1,rating:5.5}]}),/Season rating/);
  assert.throws(()=>validateMediaRecord({...series,seasons:[{number:1,episodes:[
    {number:1,rating:0}]}]}),/Episode rating/);
  assert.throws(()=>validateMediaRecord({...film,seasons:series.seasons}),/Seasons apply to TV/);
  assert.throws(()=>validateMediaRecord({...series,seasons:[{number:1,privateData:"x"}]}),/Unexpected season field/);
});

test("duplicate checks include existing files, normalized titles and matching URLs",()=>{
  const draft=composeMediaDraft(film,[
    {path:mediaPath(film),kind:"films",title:film.title,creator:film.creator,year:film.year},
    {path:"content/media/films/another.json",kind:"films",title:"Another",year:2010,
     links:[{label:"Original",url:"https://letterboxd.com/film/important/"}]},
  ]);
  assert.deepEqual(draft.duplicatePaths,[
    mediaPath(film),"content/media/films/another.json",
  ]);
  assert.equal(sameMedia(film,{...film,title:"An Important Film"}),true);
  assert.equal(sameMedia(film,{...film,kind:"tv"}),false);
});

test("catalog rejects duplicate identities across hand-edited records before publication", () => {
  const stored = (path, record) => ({
    ...validateMediaRecord(record),
    id: path.slice("content/media/".length, -".json".length),
    path,
  });
  const original = stored("content/media/films/a-film.json", film);
  const sameItem = stored("content/media/films/a-different-slug.json", {
    ...film, title: "An Important Film",
  });
  assert.throws(() => assertUniqueMediaCatalog([original, sameItem]),
    /Duplicate media identity: content\/media\/films\/a-film\.json and content\/media\/films\/a-different-slug\.json/);

  const alternateCase = stored("content/media/films/A-FILM.json", {
    ...film, title: "Different film",
  });
  assert.throws(() => assertUniqueMediaCatalog([original, alternateCase]),
    /Duplicate media path/);

  const anotherCreator = stored("content/media/films/another-director.json", {
    ...film, creator: "Another director",
  });
  assert.doesNotThrow(() => assertUniqueMediaCatalog([original, anotherCreator]));

  const tv = stored("content/media/tv/a-series.json", {
    schema: 1, kind: "tv", title: film.title, year: film.year,
  });
  assert.doesNotThrow(() => assertUniqueMediaCatalog([original, tv]));
});

test("multiple media items may share a generic external reference URL", () => {
  const record = (path, title) => ({
    ...validateMediaRecord({
      schema: 1, kind: "music", title, year: 2020,
      links: [{label: "Artist website", url: "https://example.org/artist/"}],
    }),
    id: path.slice("content/media/".length, -".json".length),
    path,
  });
  assert.doesNotThrow(() => assertUniqueMediaCatalog([
    record("content/media/music/first-album.json", "First album"),
    record("content/media/music/second-album.json", "Second album"),
  ]));
});

test("media link buttons use recognized provider labels without guessing destinations",()=>{
  const cases=[
    ["https://www.imdb.com/title/tt0050083/","IMDb"],
    ["https://www.themoviedb.org/movie/389","TMDb"],
    ["https://en.wikipedia.org/wiki/12_Angry_Men","Wikipedia"],
    ["https://www.bfi.org.uk/film/example","BFI"],
    ["https://www.criterionchannel.com/films/abc","Criterion"],
    ["https://www.criterion.com/films/abc","Criterion"],
    ["https://boxd.it/3bf2","Letterboxd"],
    ["https://musicbrainz.org/release-group/abc","MusicBrainz"],
    ["https://artist.bandcamp.com/album/example","Bandcamp"],
  ];
  for(const [url,expected] of cases){
    assert.equal(mediaSourceLabel(url,"Other source"),expected);
  }
  assert.equal(mediaSourceLabel("https://example.org/film/one","Other source"),"Other source");
  assert.equal(mediaSourceLabel("https://imdb.com.evil.example/film","External"),"External");
  assert.throws(()=>validateMediaRecord({...film,links:[
    {label:"Trakt",url:"https://trakt.tv/movies/something"}]}),/Trakt links are not supported/);
  assert.throws(()=>validateMediaRecord({...film,links:[
    {label:"Trakt",url:"https://api.trakt.tv/movies/something"}]}),/Trakt links are not supported/);
});

test("compact direct references expand to exact source URL and label",()=>{
  const samples=[
    ["imdb","tt0050083","https://www.imdb.com/title/tt0050083/","IMDb"],
    ["tmdb","movie:389","https://www.themoviedb.org/movie/389","TMDb"],
    ["tmdb","tv:1399","https://www.themoviedb.org/tv/1399","TMDb"],
    ["wikipedia","en:12_Angry_Men","https://en.wikipedia.org/wiki/12_Angry_Men","Wikipedia"],
    ["letterboxd","29BI","https://boxd.it/29BI","Letterboxd"],
    ["musicbrainz","05affa96-5959-32da-8d75-1c9eb985ca59",
      "https://musicbrainz.org/release-group/05affa96-5959-32da-8d75-1c9eb985ca59","MusicBrainz"],
  ];
  for(const [platform,id,url,label] of samples){
    assert.equal(mediaReferenceUrl(platform,id),url);
    assert.deepEqual(mediaReferenceFromUrl(url),{platform,id});
    const kind=platform==="musicbrainz" ? "music" : platform==="tmdb" && id.startsWith("tv:") ? "tv" : "films";
    const record=validateMediaRecord({schema:1,kind,title:"Test",refs:{[platform]:id}});
    assert.deepEqual(mediaSourceLinks(record),[{label,url}]);
  }
  const draft=composeMediaDraft({schema:1,kind:"films",title:"Compact",
    refs:{imdb:"tt0050083"},links:[{label:"BFI",url:"https://www.bfi.org.uk/film/real"}]},[]);
  assert.deepEqual(JSON.parse(draft.json).refs,{imdb:"tt0050083"});
  assert.equal(mediaSourceLinks(JSON.parse(draft.json)).length,2);
  assert.deepEqual(compactMediaLinks([
    {label:"IMDB link",url:"https://www.imdb.com/title/tt0050083/"},
    {label:"Other",url:"https://example.org/review"},
  ],"films"),{refs:{imdb:"tt0050083"},links:[{label:"Other",url:"https://example.org/review"}]});
});
test("invalid or lossy platform identifiers never generate untrusted links",()=>{
  for(const [platform,id] of [
    ["imdb","123"],["imdb","tt123"],
    ["tmdb","movie:0"],["tmdb","movie:2/evil"],["tmdb","person:1"],
    ["letterboxd","../bad"],["musicbrainz","not-a-uuid"],
    ["wikipedia","en:../evil"],["wikipedia","en:bad/name"],
  ]){
    assert.throws(()=>mediaReferenceUrl(platform,id),/Invalid/);
  }
  for(const url of [
    "https://www.imdb.com/title/tt0050083/?ref_=homepage",
    "https://www.themoviedb.org/movie/389/cast",
    "https://imdb.com.evil.example/title/tt0050083/",
    "https://en.wikipedia.org/wiki/Title#section",
    "http://boxd.it/2auI",
    "http://www.imdb.com/title/tt0050083/",
    "https://www.criterion.com/films/example",
  ])assert.equal(mediaReferenceFromUrl(url),null);
  const valid={schema:1,kind:"films",title:"Valid"};
  assert.throws(()=>validateMediaRecord({...valid,refs:{imdb:"javascript:evil"}}),/Invalid/);
  assert.throws(()=>validateMediaRecord({...valid,refs:{trakt:"1"}}),/Unexpected media refs field/);
  assert.throws(()=>validateMediaRecord({...valid,refs:{imdb:"tt0050083"},
    links:[{label:"IMDb",url:"https://www.imdb.com/title/tt0050083/"}]}),/Duplicate external URL/);
});
test("projected existing compact refs prevent duplicate drafts and preserve HTTP URLs",()=>{
  const stored={schema:1,kind:"films",title:"Original",year:2001,
    refs:{imdb:"tt0050083"}};
  const projected={path:"content/media/films/original-2001.json",
    kind:stored.kind,title:stored.title,year:stored.year,refs:stored.refs};
  const variant=composeMediaDraft({schema:1,kind:"films",title:"Alternate",year:2002,
    refs:{imdb:"tt0050083"}},[projected]);
  assert.deepEqual(variant.duplicatePaths,[projected.path]);
  const http={label:"Letterboxd",url:"http://boxd.it/29BI"};
  assert.deepEqual(compactMediaLinks([http],"films"),{links:[http]});
  assert.deepEqual(mediaSourceLinks(validateMediaRecord({schema:1,kind:"films",
    title:"HTTP",links:[http]})),[http]);
});

test("multiline public notes are preserved for real media reviews", () => {
  const item = validateMediaRecord({...film, notes:"First paragraph.\r\nSecond paragraph."});
  assert.equal(item.notes, "First paragraph.\nSecond paragraph.");
  assert.throws(() => validateMediaRecord({...film,notes:"Unsafe\u0002note"}),/unsafe control codes/);
});


test("classical ensemble credits round-trip up to the shared 500-character creator limit",()=>{
  const fullCredit="Staatsorchester Stuttgart / Lithuanian Chamber Orchestra / The 12 Cellists of the Berlin Philharmonic Orchestra / Dennis Russell Davies / Saulius Sondeckis / Gidon Kremer / Keith Jarrett / Tatjana Grindenko / Alfred Schnittke";
  assert.ok(fullCredit.length > 220 && fullCredit.length <= 500);
  const album={schema:1,kind:"music",title:"Tabula rasa",creator:fullCredit,year:1984,rating:4};
  assert.equal(validateMediaRecord(album).creator,fullCredit);
  assert.equal(JSON.parse(composeMediaDraft(album,[]).json).creator,fullCredit);
  assert.throws(()=>validateMediaRecord({...album,creator:"x".repeat(501)}),/1–500 printable characters/);
});

test("reject unsafe URLs, unexpected private fields and invalid metadata before GitHub handoff",()=>{
  assert.throws(()=>validateMediaRecord({...film,privateReview:"sensitive"}),/Unexpected public media field/);
  assert.throws(()=>validateMediaRecord({...film,year:2023.5}),/Year must be an integer/);
  assert.throws(()=>validateMediaRecord({...film,rating:5.5}),/Rating must be 0.5/);
  assert.throws(()=>validateMediaRecord({...film,rating:3.3}),/half-star/);
  assert.throws(()=>validateMediaRecord({...film,status:"unknown"}),/Invalid media status/);
  assert.throws(()=>validateMediaRecord({...film,links:[{label:"No",url:"javascript:alert(1)"}]}),/Only absolute HTTP/);
  assert.throws(()=>validateMediaRecord({...film,links:[{label:"No",url:"https://user:pass@example.com/"}]}),/without credentials/);
  assert.throws(()=>validateMediaRecord({...film,title:"Invalid\nTitle"}),/printable/);
  assert.throws(()=>githubMediaEditorUrl("content/media/films/../evil.json","{}"),/Invalid media draft path/);
  assert.throws(()=>githubMediaEditorUrl("content/bookmarks/a.md","{}"),/Invalid media draft path/);
});

test("Astro media collection IDs omit extension for the first real JSON file", () => {
  assert.equal(mediaEntryId("films/a-film.json"), "films/a-film");
  assert.equal(mediaEntryId("music\\a-release.json"), "music/a-release");
  assert.equal(mediaEntryId("tv/čudni-naslovi.json"), "tv/čudni-naslovi");
  assert.throws(() => mediaEntryId("films/a-film.json.json"), /Invalid media source path/);
  assert.throws(() => mediaEntryId("films/../secret.json"), /Invalid media source path/);
  assert.throws(() => mediaEntryId("film/a-film.json"), /Invalid media source path/);
});

test("provider editor adds MusicBrainz ID without changing source identity or scores",()=>{
  const record={schema:1,kind:"music",title:"記憶",creator:"Toshinori Kondo",year:1996,
    rating:4.5,notes:"My notes",tracks:[{disc:1,number:1,title:"Opening",rating:3.5}]};
  const stored={...record,id:"music/記憶-1996",path:"content/media/music/記憶-1996.json"};
  const id="05affa96-5959-32da-8d75-1c9eb985ca59";
  const input={musicbrainz:"https://musicbrainz.org/release-group/"+id};
  const edited=composeMediaReferenceEdit(stored,input,[stored]);
  assert.equal(edited.path,stored.path);
  assert.equal(edited.changed,true);
  assert.deepEqual(JSON.parse(edited.json),{...record,refs:{musicbrainz:id}});
  assert.equal(stored.refs,undefined,"drafting does not mutate the source record");
  assert.equal(githubExistingMediaEditorUrl(edited.path),
    "https://github.com/Fooftilly/Fooftilly.github.io/edit/master/content/media/music/%E8%A8%98%E6%86%B6-1996.json");
});

test("provider editor updates and removes references while preserving other metadata",()=>{
  const record={schema:1,kind:"films",title:"Film",year:2024,rating:4,
    status:"finished",refs:{imdb:"tt1234567",tmdb:"movie:55"},
    links:[{label:"BFI",url:"https://www.bfi.org.uk/films/example"}]};
  const stored={...record,id:"films/film-2024",path:"content/media/films/film-2024.json"};
  const edited=composeMediaReferenceEdit(stored,{imdb:"tt7654321",tmdb:"",wikipedia:"en:Example"},[stored]);
  assert.deepEqual(JSON.parse(edited.json),{...record,refs:{imdb:"tt7654321",wikipedia:"en:Example"}});
  assert.equal(edited.changed,true);
  assert.equal(composeMediaReferenceEdit(stored,record.refs,[stored]).changed,false);
  const removed=composeMediaReferenceEdit(stored,{},[stored]);
  assert.equal(JSON.parse(removed.json).refs,undefined);
  assert.equal(removed.changed,true);
});

test("provider editor converts duplicated direct links and rejects unsafe or conflicting IDs",()=>{
  const id="05affa96-5959-32da-8d75-1c9eb985ca59";
  const link="https://musicbrainz.org/release-group/"+id;
  const stored={schema:1,kind:"music",title:"Album",year:2002,
    links:[{label:"MusicBrainz",url:link},{label:"Label",url:"https://example.org/album"}],
    id:"music/album-2002",path:"content/media/music/album-2002.json"};
  const edited=composeMediaReferenceEdit(stored,{musicbrainz:id},[stored]);
  assert.deepEqual(JSON.parse(edited.json).links,[{label:"Label",url:"https://example.org/album"}]);
  const other={...stored,id:"music/other",path:"content/media/music/other.json",refs:{musicbrainz:id}};
  assert.throws(()=>composeMediaReferenceEdit(stored,{musicbrainz:id},[stored,other]),/already assigned/);
  for(const invalid of ["https://musicbrainz.org/release/"+id,"https://evil.example/release-group/"+id,"javascript:alert(1)","bad-uuid"])
    assert.throws(()=>composeMediaReferenceEdit(stored,{musicbrainz:invalid},[stored]),/Invalid/);
  assert.throws(()=>composeMediaReferenceEdit(stored,{imdb:link},[stored]),/Invalid/);
  assert.throws(()=>composeMediaReferenceEdit({...stored,path:"content/media/music/../evil.json"},{},[]),/mismatch|Invalid/);
  assert.throws(()=>githubExistingMediaEditorUrl("content/media/films/../evil.json"),/Invalid/);
});

test("provider editor rejects canonical direct-provider pages on other categories or plain links",()=>{
  const active={schema:1,kind:"films",title:"Film collection",year:2024,
    id:"films/film-collection-2024",path:"content/media/films/film-collection-2024.json"};
  const imdb="tt1234567";
  const imdbUrl=mediaReferenceUrl("imdb",imdb);
  const other={path:"content/media/films/feature-2022.json",
    links:[{label:"Film reference",url:imdbUrl}]};
  assert.throws(()=>composeMediaReferenceEdit(active,{imdb},[active,other]),/already assigned/);
  assert.throws(()=>composeMediaReferenceEdit(active,{imdb:imdbUrl},[active,other]),/already assigned/);
  const otherRef={path:"content/media/tv/series-2024.json",refs:{wikipedia:"en:Example_Article"}};
  assert.throws(()=>composeMediaReferenceEdit(active,{wikipedia:"en:Example_Article"},[active,otherRef]),/already assigned/);
  // Existing unrelated reviews or artist homepages are not unique identities.
  const generic={path:"content/media/films/another-2024.json",
    links:[{label:"Director homepage",url:"https://example.org/artist"}]};
  assert.doesNotThrow(()=>composeMediaReferenceEdit(active,{imdb},[active,generic]));
});

test("provider editor preserves case-sensitive Letterboxd IDs without false positives",()=>{
  const first={schema:1,kind:"films",title:"First film",id:"films/first",path:"content/media/films/first.json"};
  const upper={path:"content/media/films/second.json",refs:{letterboxd:"5PZe"}};
  const lower={path:"content/media/films/third.json",refs:{letterboxd:"5pzE"}};
  assert.deepEqual(JSON.parse(composeMediaReferenceEdit(first,{letterboxd:"5pzE"},[first,upper]).json).refs,
    {letterboxd:"5pzE"});
  assert.deepEqual(JSON.parse(composeMediaReferenceEdit(first,{letterboxd:"5PZe"},[first,lower]).json).refs,
    {letterboxd:"5PZe"});
  assert.throws(()=>composeMediaReferenceEdit(first,{letterboxd:"5pzE"},[first,lower]),/already assigned/);
  assert.throws(()=>composeMediaReferenceEdit(first,{letterboxd:"https://boxd.it/5PZe"},[first,upper]),/already assigned/);
  // MusicBrainz UUIDs remain case-insensitive; normalizing them is intentional.
  const id="05affa96-5959-32da-8d75-1c9eb985ca59";
  const other={path:"content/media/music/release.json",refs:{musicbrainz:id}};
  const album={schema:1,kind:"music",title:"Album",id:"music/album",path:"content/media/music/album.json"};
  assert.throws(()=>composeMediaReferenceEdit(album,{musicbrainz:id.toUpperCase()},[album,other]),/already assigned/);
});

test("edition-qualified versions stay distinct but legacy paths remain unchanged",()=>{
  const base={schema:1,kind:"music",title:"4 Sucessos",creator:"Kate Bush",year:1978};
  const first=validateMediaRecord({...base,edition:"Part 1 EMI 31C 016 06894",rating:4});
  const second=validateMediaRecord({...base,edition:"Part 2 EMI 31C 016 07144",rating:3.5});
  assert.equal(mediaPath(base),"content/media/music/4-sucessos-1978-kate-bush.json");
  assert.equal(mediaPath(first),"content/media/music/4-sucessos-1978-kate-bush-part-1-emi-31c-016-06894.json");
  assert.notEqual(mediaPath(first),mediaPath(second));
  assert.equal(sameMedia(first,second),false);
  assert.equal(sameMedia(first,{...first,edition:"part 1 emi 31c 016 06894"}),true);
  assert.equal(sameMedia(base,first),true);
  const stored=x=>({...x,id:mediaPath(x).slice(14,-5),path:mediaPath(x)});
  assert.doesNotThrow(()=>assertUniqueMediaCatalog([stored(first),stored(second)]));
  assert.throws(()=>assertUniqueMediaCatalog([stored(first),stored(base)]),/Duplicate media identity/);
  assert.throws(()=>assertUniqueMediaCatalog([stored(first),stored({...second,edition:"Part 1 EMI 31C 016 06894"})]),/Duplicate media/);
  assert.equal(composeMediaDraft(second,[stored(first)]).duplicatePaths.length,0);
  assert.deepEqual(composeMediaDraft(first,[stored(first)]).duplicatePaths,[mediaPath(first)]);
  assert.equal(JSON.parse(composeMediaDraft(second,[]).json).edition,second.edition);
});

test("edition suffix remains visible for long credits and rejects invalid edition text",()=>{
  const base={schema:1,kind:"music",title:"Concert",creator:"A".repeat(250),year:1998};
  assert.equal(mediaSlug(base).length,110);
  assert.ok(mediaSlug({...base,edition:"Live take B"}).endsWith("-live-take-b"));
  assert.notEqual(mediaSlug({...base,edition:"Live take B"}),mediaSlug({...base,edition:"Live take C"}));
  assert.ok(mediaSlug({...base,edition:"Live take B"}).length<=110);
  assert.throws(()=>validateMediaRecord({...base,edition:"x".repeat(121)}),/Edition must be 1–120/);
  assert.throws(()=>validateMediaRecord({...base,edition:"part 1\nprivate"}),/printable/);
  assert.equal(validateMediaRecord(base).edition,undefined);
});

test("full edition label distinguishes long names with the same first 40 characters",()=>{
  const base={schema:1,kind:"music",title:"4 Sucessos",creator:"Kate Bush",year:1978};
  const a={...base,edition:"Original Brazilian pressing EMI 31C 016 06894"};
  const b={...base,edition:"Original Brazilian pressing EMI 31C 016 07144"};
  assert.equal(sameMedia(a,b),false);
  assert.equal(a.edition.slice(0,40),b.edition.slice(0,40),
    "The test must reproduce the old truncated-suffix collision");
  const pa=mediaPath(a),pb=mediaPath(b);
  assert.notEqual(pa,pb,"The complete edition labels must remain distinguishable");
  assert.ok(pa.endsWith(".json")&&pb.endsWith(".json"));
  assert.ok(mediaSlug(a).length<=110&&mediaSlug(b).length<=110);
  assert.equal(mediaPath(a),pa,"Slug generation must be deterministic");
  const prefix="4-sucessos-1978-kate-bush-original-brazilian";
  assert.ok(pa.includes(prefix)&&pb.includes(prefix),
    "A readable prefix must survive hashing");
  const stored=x=>({...x,id:mediaPath(x).slice(14,-5),path:mediaPath(x)});
  assert.deepEqual(composeMediaDraft(b,[stored(a)]).duplicatePaths,[]);
  assert.doesNotThrow(()=>assertUniqueMediaCatalog([stored(a),stored(b)]));
  assert.deepEqual(composeMediaDraft(b,[stored(b)]).duplicatePaths,[pb],
    "A genuine duplicate edition must still be blocked");
});

test("long Unicode edition suffixes are deterministic and valid",()=>{
  const record={schema:1,kind:"music",title:"Concert",creator:"Toshinori Kondo",year:2000};
  const a={...record,edition:"超長い限定版コンサート記録".repeat(5)+" 第一巻"};
  const b={...record,edition:"超長い限定版コンサート記録".repeat(5)+" 第二巻"};
  assert.notEqual(mediaPath(a),mediaPath(b));
  assert.ok(mediaSlug(a).length<=110&&mediaSlug(b).length<=110);
  assert.equal(mediaPath(a),mediaPath(a));
  assert.doesNotThrow(()=>validateMediaRecord(a));
  assert.doesNotThrow(()=>validateMediaRecord(b));
});

test("existing album rating editor adds tracks without rewriting imported album data",()=>{
  const album={schema:1,kind:"music",title:"Album",creator:"Artist",year:2024,
    edition:"Verified 7-inch",rating:4,notes:"Published note",
    refs:{musicbrainz:"05affa96-5959-32da-8d75-1c9eb985ca59"},
    links:[{label:"Source",url:"https://example.org/album"}]};
  const entry={...album,id:"music/album-2024-artist-verified-7-inch",
    path:"content/media/music/album-2024-artist-verified-7-inch.json"};
  const input={rating:4,tracks:[{disc:1,number:1,title:"First take",rating:4.5},
                                {disc:1,number:2,title:"Second take"}]};
  const edited=composeMediaRatingsEdit(entry,input);
  assert.equal(edited.changed,true);
  assert.equal(edited.path,entry.path);
  assert.deepEqual(JSON.parse(edited.json),{...album,tracks:input.tracks});
  assert.equal(entry.tracks,undefined,"Drafting never modifies original tracks");
  assert.deepEqual(JSON.parse(composeMediaRatingsEdit(entry,{rating:4}).json),album);
  assert.equal(composeMediaRatingsEdit(entry,{rating:4}).changed,false);
});

test("existing TV nested ratings are independent and preserve unrelated metadata",()=>{
  const record={schema:1,kind:"tv",title:"Series",rating:3.5,status:"finished",
    seasons:[{number:1,title:"First",rating:4,episodes:[
      {number:1,title:"Pilot",rating:2.5},{number:2,title:"Finale"}]}]};
  const entry={...record,id:"tv/series",path:"content/media/tv/series.json"};
  const nextSeasons=[{number:1,title:"First",rating:4.5,episodes:[
    {number:1,title:"Pilot",rating:5},{number:2,title:"Finale",rating:3.5}]}];
  const result=composeMediaRatingsEdit(entry,{rating:0,seasons:nextSeasons});
  const {rating:_rating,...withoutRating}=record;
  assert.deepEqual(JSON.parse(result.json),{...withoutRating,seasons:nextSeasons});
  assert.equal(JSON.parse(result.json).rating,undefined);
  assert.equal(entry.seasons[0].episodes[0].rating,2.5);
  assert.equal(JSON.parse(composeMediaRatingsEdit(entry,{rating:3.5}).json).rating,3.5);
});

test("existing media rating editor rejects invalid ratings, positions and cross-category data",()=>{
  const album={schema:1,kind:"music",title:"Album",rating:4,
    id:"music/album",path:"content/media/music/album.json"};
  assert.throws(()=>composeMediaRatingsEdit(album,{rating:5.5}),/Rating/);
  assert.throws(()=>composeMediaRatingsEdit(album,{rating:3.3}),/Rating/);
  assert.throws(()=>composeMediaRatingsEdit(album,{rating:4,tracks:[
    {disc:1,number:1,title:"First"},{disc:1,number:1,title:"Duplicate"}]}),/Duplicate track position/);
  assert.throws(()=>composeMediaRatingsEdit(album,{rating:4,tracks:[
    {disc:1,number:0,title:"Invalid"}]}),/Track number/);
  assert.throws(()=>composeMediaRatingsEdit(album,{rating:4,seasons:[]}),/Seasons are only/);
  const film={...album,kind:"films",id:"films/album",path:"content/media/films/album.json"};
  assert.throws(()=>composeMediaRatingsEdit(film,{rating:2,tracks:[]}),/Films do not/);
  const series={...album,kind:"tv",id:"tv/album",path:"content/media/tv/album.json"};
  assert.throws(()=>composeMediaRatingsEdit(series,{rating:2,tracks:[]}),/Tracks are only/);
  assert.throws(()=>composeMediaRatingsEdit({...album,path:"content/media/music/../evil.json"},{rating:4}),/mismatch/);
});

test("provider IDs match the item's media category, including TMDb movie/TV types",()=>{
  const base={schema:1,title:"A title"};
  for(const [kind,platform,id] of [
    ["music","musicbrainz","05affa96-5959-32da-8d75-1c9eb985ca59"],
    ["music","wikipedia","en:Music"],
    ["films","imdb","tt0050083"],
    ["films","letterboxd","29BI"],
    ["films","tmdb","movie:389"],
    ["tv","tmdb","tv:1399"],
    ["tv","imdb","tt1234567"],
    ["tv","wikipedia","en:TV_series"],
  ]) assert.deepEqual(validateMediaRecord({...base,kind,refs:{[platform]:id}}).refs,{[platform]:id});
  for(const [kind,platform,id] of [
    ["music","imdb","tt0050083"],["music","tmdb","movie:389"],
    ["music","letterboxd","29BI"],
    ["films","musicbrainz","05affa96-5959-32da-8d75-1c9eb985ca59"],
    ["films","tmdb","tv:1399"],
    ["tv","musicbrainz","05affa96-5959-32da-8d75-1c9eb985ca59"],
    ["tv","letterboxd","29BI"],
    ["tv","tmdb","movie:389"],
  ]) {
    const item={...base,kind,refs:{[platform]:id}};
    assert.throws(()=>validateMediaRecord(item),/provider reference is not supported/);
    const stored={...base,kind,id:kind+"/item",path:"content/media/"+kind+"/item.json"};
    assert.throws(()=>composeMediaReferenceEdit(stored,{[platform]:id},[stored]),
      /provider reference is not supported/);
  }
});

test("category-aware URL compaction keeps unrelated links but only types valid refs",()=>{
  const musicbrainz="https://musicbrainz.org/release-group/05affa96-5959-32da-8d75-1c9eb985ca59";
  const movie="https://www.themoviedb.org/movie/389";
  const series="https://www.themoviedb.org/tv/1399";
  const items=[
    {label:"MusicBrainz",url:musicbrainz},
    {label:"IMDb",url:"https://www.imdb.com/title/tt0050083/"},
    {label:"TMDb movie",url:movie},
    {label:"TMDb series",url:series},
  ];
  const music=compactMediaLinks(items,"music");
  assert.deepEqual(music.refs,{musicbrainz:"05affa96-5959-32da-8d75-1c9eb985ca59"});
  assert.equal(music.links.length,3);
  const film=compactMediaLinks(items,"films");
  assert.deepEqual(film.refs,{imdb:"tt0050083",tmdb:"movie:389"});
  assert.equal(film.links.length,2);
  const tv=compactMediaLinks(items,"tv");
  assert.deepEqual(tv.refs,{imdb:"tt0050083",tmdb:"tv:1399"});
  assert.equal(tv.links.length,2);
});
