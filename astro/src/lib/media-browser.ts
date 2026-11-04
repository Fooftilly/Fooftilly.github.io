/** Search and order Git-managed media without relying on an external provider. */
export type MediaSort = "rating" | "title" | "year";
export interface MediaListing { title: string; id: string; year?: number; rating?: number }

export const normalizeMediaSearch = (value: string): string => value.normalize("NFKD")
  .replace(/\p{M}/gu, "").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();

/** Index only media fields; external link labels are not metadata. */
export function searchableMediaText(item: {
  title:string;creator?:string;year?:number;status?:string;notes?:string
}):string {
  return [item.title,item.creator??"",item.year?.toString()??"",item.status??"",item.notes??""].join(" ");
}
/** All search terms may occur in different table cells, including public notes. */
export function matchesMediaSearch(rowText: string, query: string): boolean {
  const terms = normalizeMediaSearch(query).split(" ").filter(Boolean);
  const haystack = normalizeMediaSearch(rowText);
  return terms.every(term => haystack.includes(term));
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
