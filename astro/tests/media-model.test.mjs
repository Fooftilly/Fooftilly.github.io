import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMediaRecord, mediaSlug, mediaPath, composeMediaDraft,
  sameMedia, githubMediaEditorUrl, mediaEntryId, assertUniqueMediaCatalog, mediaSourceLabel,
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

test("multiline public notes are preserved for real media reviews", () => {
  const item = validateMediaRecord({...film, notes:"First paragraph.\r\nSecond paragraph."});
  assert.equal(item.notes, "First paragraph.\nSecond paragraph.");
  assert.throws(() => validateMediaRecord({...film,notes:"Unsafe\u0002note"}),/unsafe control codes/);
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
