/** Search and order Git-managed media without relying on an external provider. */
export type MediaSort = "rating" | "title" | "year";
export type MediaStatusFilter = "all" | "finished" | "in-progress" | "planned" | "unspecified";

/** Status is optional in the site-owned JSON schema; do not hide unrated or
 * unclassified entries unless the visitor selected a specific status. */
export function matchesMediaStatus(entry: {status?: string}, filter: MediaStatusFilter): boolean {
  return filter === "all" || (filter === "unspecified" ? !entry.status : entry.status === filter);
}

/** 0 keeps the entire collection, including unrated records. */
export function matchesMediaMinimumRating(entry: {rating?: number}, minimum: number): boolean {
  return minimum === 0 || (entry.rating !== undefined && entry.rating >= minimum);
}
export interface MediaListing { title: string; id: string; year?: number; rating?: number }

export const normalizeMediaSearch = (value: string): string => value.normalize("NFKD")
  .replace(/\p{M}/gu, "").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();

/** Index only media fields; external link labels are not metadata. */
export function searchableMediaText(item: {
  title:string;creator?:string;year?:number;status?:string;notes?:string
}):string {
  const status = item.status === "in-progress" ? "in-progress In progress" : item.status ?? "";
  return [item.title,item.creator??"",item.year?.toString()??"",status,item.notes??""].join(" ");
}
/** All search terms may occur in different table cells, including public notes. */
export function matchesMediaSearch(rowText: string, query: string): boolean {
  const terms = normalizeMediaSearch(query).split(" ").filter(Boolean);
  const haystack = normalizeMediaSearch(rowText);
  return terms.every(term => haystack.includes(term));
}

/** Reveal collapsed notes only when they explain a search match not visible
 * in the row's title, creator, year or status. Keep default listings compact.
 */
export function mediaNotesExplainSearch(
  item: {title:string;creator?:string;year?:number;status?:string;notes?:string},
  query: string,
): boolean {
  if (!item.notes || !query.trim() || !matchesMediaSearch(searchableMediaText(item), query)) return false;
  const terms = normalizeMediaSearch(query).split(" ").filter(Boolean);
  const visible = normalizeMediaSearch(searchableMediaText({...item, notes: undefined}));
  const notes = normalizeMediaSearch(item.notes);
  return terms.some(term => notes.includes(term) && !visible.includes(term));
}

const descendingOptional = (a?: number, b?: number): number => {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return b - a;
};

export function compareMediaListings(a: MediaListing, b: MediaListing, sort: MediaSort): number {
  const numeric = sort === "year" ? descendingOptional(a.year,b.year)
    : sort === "rating" ? descendingOptional(a.rating,b.rating) : 0;
  return numeric || a.title.localeCompare(b.title,"en",{sensitivity:"base"}) || a.id.localeCompare(b.id);
}


/** Preserve all source rows in static SSR HTML. Hydrated Vue limits live DOM
 * rows while retaining the same full match/count/source semantics.
 */
export const MEDIA_PAGE_SIZE = 50;
export function mediaVisiblePage<T>(matches: readonly T[], limit: number, hydrated: boolean): readonly T[] {
  if (!hydrated) return matches;
  return matches.slice(0, Math.max(0, Math.floor(limit)));
}
