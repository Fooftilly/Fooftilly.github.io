/** Site-owned media model. Import providers are optional references, never IDs. */
export const MEDIA_KINDS = ["music", "films", "tv"] as const;
export type MediaKind = typeof MEDIA_KINDS[number];
export const MEDIA_STATUSES = ["finished", "in-progress", "planned"] as const;
export type MediaStatus = typeof MEDIA_STATUSES[number];
export interface MediaLink { label: string; url: string }
export interface MediaTrack { disc: number; number: number; title: string; rating?: number }
export interface MediaEpisode { number: number; title?: string; rating?: number }
export interface MediaSeason { number: number; title?: string; rating?: number; episodes?: MediaEpisode[] }
export interface MediaRecord {
  schema: 1;
  kind: MediaKind;
  title: string;
  creator?: string;
  year?: number;
  rating?: number;
  status?: MediaStatus;
  notes?: string;
  links?: MediaLink[];
  tracks?: MediaTrack[];
  seasons?: MediaSeason[];
}
export interface StoredMedia extends MediaRecord { id: string; path: string }
export interface MediaDraft {
  path: string;
  json: string;
  duplicatePaths: string[];
}
export interface ExistingMediaRef {
  path: string;
  kind: MediaKind;
  title: string;
  year?: number;
  creator?: string;
  links?: MediaLink[];
}
const ascii = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const safeText = (raw: unknown, label: string, max: number): string => {
  if (typeof raw !== "string") throw new Error(label + " must be text");
  const value = raw.trim().normalize("NFC");
  if (!value || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error(label + " must be 1–" + max + " printable characters");
  }
  return value;
};
function optionalText(raw: unknown, label: string, max: number): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  return safeText(raw,label,max);
}
/** Notes may contain paragraphs; titles, URLs and labels may not contain controls. */
function publicNotes(raw: unknown): string | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (typeof raw !== "string") throw new Error("Notes must be text");
  const notes = raw.replace(/\r\n?/g, "\n").trim().normalize("NFC");
  if (!notes || notes.length > 5000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(notes)) {
    throw new Error("Notes must be 1–5000 public characters without unsafe control codes");
  }
  return notes;
}
/** Present familiar provider names without fabricating a per-title destination.
 * The URL always comes from an explicit source record, never a search slug.
 */
export function mediaSourceLabel(rawUrl: string, fallback: string): string {
  let host: string;
  try { host=new URL(rawUrl).hostname.toLowerCase(); }
  catch { return fallback; }
  const is=(domain:string)=>host===domain||host.endsWith("."+domain);
  if(is("imdb.com"))return "IMDb";
  if(is("themoviedb.org"))return "TMDb";
  if(is("wikipedia.org"))return "Wikipedia";
  if(is("bfi.org.uk"))return "BFI";
  if(is("criterion.com")||is("criterionchannel.com"))return "Criterion";
  if(is("letterboxd.com")||host==="boxd.it")return "Letterboxd";
  if(is("rateyourmusic.com"))return "RYM";
  if(is("musicbrainz.org"))return "MusicBrainz";
  if(is("allmusic.com"))return "AllMusic";
  if(is("discogs.com"))return "Discogs";
  if(is("bandcamp.com"))return "Bandcamp";
  return fallback;
}
export function validateMediaLink(raw: unknown): MediaLink {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid external link");
  const obj = raw as Record<string,unknown>;
  if (Object.keys(obj).some(key => !["label","url"].includes(key))) throw new Error("Unexpected link metadata");
  const label = safeText(obj.label, "Link label", 48);
  const value = safeText(obj.url, "Link URL", 2048);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid external link URL"); }
  if (!["http:","https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Only absolute HTTP/HTTPS links without credentials are permitted");
  }
  if (url.hostname === "trakt.tv" || url.hostname.endsWith(".trakt.tv")) {
    throw new Error("Trakt links are not supported");
  }
  return { label, url: url.href };
}
function ratingOf(raw: unknown, label: string): number {
  if(typeof raw !== "number" || !Number.isFinite(raw) ||
     raw < 0.5 || raw > 5 || !Number.isInteger(raw * 2))
    throw new Error(label + " must be 0.5–5 in half-star steps");
  return raw;
}
function integerOf(raw: unknown, label: string, min: number, max: number): number {
  if(typeof raw !== "number" || !Number.isInteger(raw) || raw < min || raw > max)
    throw new Error(label + " must be an integer from " + min + " to " + max);
  return raw;
}
function objectFields(raw: unknown, fields: string[], label: string): Record<string,unknown> {
  if(!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(label + " must be an object");
  const value=raw as Record<string,unknown>;
  if(Object.keys(value).some(field=>!fields.includes(field)))
    throw new Error("Unexpected "+label+" field");
  return value;
}
function validateTracks(raw: unknown): MediaTrack[] {
  if(!Array.isArray(raw) || !raw.length || raw.length>500)
    throw new Error("Tracks require 1–500 entries");
  const seen=new Set<string>();
  return raw.map(item=>{
    const value=objectFields(item,["disc","number","title","rating"],"track");
    const disc=integerOf(value.disc,"Disc",1,50);
    const number=integerOf(value.number,"Track number",1,250);
    const identity=disc+":"+number;
    if(seen.has(identity))throw new Error("Duplicate track position "+identity);
    seen.add(identity);
    const track:MediaTrack={disc,number,title:safeText(value.title,"Track title",250)};
    if(value.rating!==undefined)track.rating=ratingOf(value.rating,"Track rating");
    return track;
  });
}
function validateSeasons(raw: unknown): MediaSeason[] {
  if(!Array.isArray(raw) || !raw.length || raw.length>200)
    throw new Error("Seasons require 1–200 entries");
  const seen=new Set<number>();
  return raw.map(item=>{
    const value=objectFields(item,["number","title","rating","episodes"],"season");
    const number=integerOf(value.number,"Season number",0,200);
    if(seen.has(number))throw new Error("Duplicate season number "+number);
    seen.add(number);
    const season:MediaSeason={number};
    const title=optionalText(value.title,"Season title",250);
    if(title)season.title=title;
    if(value.rating!==undefined)season.rating=ratingOf(value.rating,"Season rating");
    if(value.episodes!==undefined){
      if(!Array.isArray(value.episodes) || !value.episodes.length || value.episodes.length>500)
        throw new Error("Episodes require 1–500 entries");
      const episodeNumbers=new Set<number>();
      season.episodes=value.episodes.map(item=>{
        const fields=objectFields(item,["number","title","rating"],"episode");
        const num=integerOf(fields.number,"Episode number",1,1000);
        if(episodeNumbers.has(num))throw new Error("Duplicate episode number "+num);
        episodeNumbers.add(num);
        const episode:MediaEpisode={number:num};
        const episodeTitle=optionalText(fields.title,"Episode title",250);
        if(episodeTitle)episode.title=episodeTitle;
        if(fields.rating!==undefined)episode.rating=ratingOf(fields.rating,"Episode rating");
        return episode;
      });
    }
    return season;
  });
}
export function validateMediaRecord(raw: unknown, expectedKind?: MediaKind): MediaRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid media record");
  const obj=raw as Record<string,unknown>;
  if (obj.schema !== 1 || !MEDIA_KINDS.includes(obj.kind as MediaKind)) throw new Error("Unsupported media schema or category");
  if (expectedKind && obj.kind!==expectedKind) throw new Error("Media kind differs from directory");
  const fields=["schema","kind","title","creator","year","rating","status","notes","links","tracks","seasons"];
  if (Object.keys(obj).some(key=>!fields.includes(key))) throw new Error("Unexpected public media field (possible private metadata)");
  const result: MediaRecord={schema:1,kind:obj.kind as MediaKind,title:safeText(obj.title,"Title",250)};
  const creator=optionalText(obj.creator,"Artist/director/creator",220);
  if(creator) result.creator=creator;
  if(obj.year!==undefined){
    if(typeof obj.year!=="number" || !Number.isInteger(obj.year) || obj.year<1800 || obj.year>2200)
      throw new Error("Year must be an integer from 1800 to 2200");
    result.year=obj.year;
  }
  if(obj.rating!==undefined) result.rating=ratingOf(obj.rating,"Rating");
  if(obj.status!==undefined){
    if(!MEDIA_STATUSES.includes(obj.status as MediaStatus)) throw new Error("Invalid media status");
    result.status=obj.status as MediaStatus;
  }
  const notes=publicNotes(obj.notes);
  if(notes) result.notes=notes;
  if(obj.links!==undefined){
    if(!Array.isArray(obj.links)||obj.links.length>8) throw new Error("Up to eight external links are supported");
    const links=obj.links.map(validateMediaLink);
    if(new Set(links.map(l=>l.url)).size!==links.length) throw new Error("Duplicate external URL");
    if(links.length) result.links=links;
  }
  if(obj.tracks!==undefined){
    if(obj.kind!=="music")throw new Error("Tracks apply to music albums only");
    result.tracks=validateTracks(obj.tracks);
  }
  if(obj.seasons!==undefined){
    if(obj.kind!=="tv")throw new Error("Seasons apply to TV and anime only");
    result.seasons=validateSeasons(obj.seasons);
  }
  return result;
}
/** Astro glob's entry IDs must omit .json; share this with the unit tests.
 * Invalid paths are rejected before any media entry reaches the public build.
 */
export function mediaEntryId(entry: string): string {
  const normalized = entry.replaceAll("\\", "/");
  if (!/^(?:music|films|tv)\/[\p{L}\p{N}-]+\.json$/u.test(normalized)) {
    throw new Error("Invalid media source path: " + entry);
  }
  return normalized.slice(0, -5);
}

/** Source-agnostic filename derived from visible metadata, never a provider key. */
export function mediaSlug(record: Pick<MediaRecord,"title"|"year"|"creator">): string {
  const parts=[record.title,record.year?.toString()??"",record.creator??""].filter(Boolean);
  const slug=ascii(parts.join(" ")).replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-+$/g,"").slice(0,110).replace(/-+$/g,"");
  if(!slug) throw new Error("Media title cannot form a safe filename");
  return slug;
}
export function mediaPath(record: MediaRecord): string {
  return "content/media/" + record.kind + "/" + mediaSlug(record) + ".json";
}
/** Stable identity bucket for large imports; not a provider identifier. */
export function mediaMatchKey(record:Pick<MediaRecord,"kind"|"title"|"year">):string {
  const title=ascii(record.title).replace(/[^\p{L}\p{N}]+/gu,"");
  return record.kind+"|"+title+"|"+(record.year??0);
}
export function sameMedia(a: Pick<MediaRecord,"kind"|"title"|"year"|"creator">,
                           b: Pick<MediaRecord,"kind"|"title"|"year"|"creator">): boolean {
  if(mediaMatchKey(a)!==mediaMatchKey(b))return false;
  const norm=(s:string)=>ascii(s).replace(/[^\p{L}\p{N}]+/gu,"");
  return !a.creator||!b.creator||norm(a.creator)===norm(b.creator);
}
/** Publication gate for reviewed JSON records, including hand-edited files.
 * Check the full collection, not just the category selected for one page.
 * Shared generic reference URLs are allowed (e.g. multiple albums linking to
 * the same artist homepage); only identical media identities are hard errors.
 */
export function assertUniqueMediaCatalog(entries: readonly StoredMedia[]): void {
  const byPath = new Map<string, StoredMedia>();
  const byIdentity = new Map<string, StoredMedia[]>();
  for (const entry of entries) {
    const pathKey = entry.path.toLowerCase();
    const previousPath = byPath.get(pathKey);
    if (previousPath) {
      throw new Error("Duplicate media path: " + previousPath.path + " and " + entry.path);
    }
    const identity = mediaMatchKey(entry);
    const matches = byIdentity.get(identity) ?? [];
    const duplicate = matches.find(previous => sameMedia(previous, entry));
    if (duplicate) {
      throw new Error("Duplicate media identity: " + duplicate.path + " and " + entry.path);
    }
    byPath.set(pathKey, entry);
    matches.push(entry);
    byIdentity.set(identity, matches);
  }
}

export function composeMediaDraft(raw: unknown, existing: readonly ExistingMediaRef[]): MediaDraft {
  const record=validateMediaRecord(raw);
  const path=mediaPath(record);
  const duplicatePaths=existing.filter(x =>
    x.path.toLowerCase()===path.toLowerCase() || sameMedia(x,record) ||
    Boolean(x.links?.some(l=>record.links?.some(k=>k.url===l.url)))
  ).map(x=>x.path);
  return {path,json:JSON.stringify(record,null,2)+"\n",duplicatePaths};
}
export function githubMediaEditorUrl(path:string,json:string):string{
  if(!/^content\/media\/(?:music|films|tv)\/[\p{L}\p{N}-]+\.json$/u.test(path)) throw new Error("Invalid media draft path");
  const url=new URL("https://github.com/Fooftilly/Fooftilly.github.io/new/master");
  url.searchParams.set("filename",path);
  url.searchParams.set("value",json);
  return url.href;
}
