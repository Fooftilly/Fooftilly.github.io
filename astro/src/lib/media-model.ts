/** Site-owned media model. Import providers are optional references, never IDs. */
export const MEDIA_KINDS = ["music", "films", "tv"] as const;
export type MediaKind = typeof MEDIA_KINDS[number];
export const MEDIA_STATUSES = ["finished", "in-progress", "planned"] as const;
export type MediaStatus = typeof MEDIA_STATUSES[number];
export interface MediaLink { label: string; url: string }
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
  return { label, url: url.href };
}
export function validateMediaRecord(raw: unknown, expectedKind?: MediaKind): MediaRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid media record");
  const obj=raw as Record<string,unknown>;
  if (obj.schema !== 1 || !MEDIA_KINDS.includes(obj.kind as MediaKind)) throw new Error("Unsupported media schema or category");
  if (expectedKind && obj.kind!==expectedKind) throw new Error("Media kind differs from directory");
  const fields=["schema","kind","title","creator","year","rating","status","notes","links"];
  if (Object.keys(obj).some(key=>!fields.includes(key))) throw new Error("Unexpected public media field (possible private metadata)");
  const result: MediaRecord={schema:1,kind:obj.kind as MediaKind,title:safeText(obj.title,"Title",250)};
  const creator=optionalText(obj.creator,"Artist/director/creator",220);
  if(creator) result.creator=creator;
  if(obj.year!==undefined){
    if(typeof obj.year!=="number" || !Number.isInteger(obj.year) || obj.year<1800 || obj.year>2200)
      throw new Error("Year must be an integer from 1800 to 2200");
    result.year=obj.year;
  }
  if(obj.rating!==undefined){
    if(typeof obj.rating!=="number"||obj.rating<0.5||obj.rating>5||!Number.isInteger(obj.rating*2))
      throw new Error("Rating must be 0.5–5 in half-star steps");
    result.rating=obj.rating;
  }
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
