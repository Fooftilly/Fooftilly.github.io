import type { MediaSort } from "./media-browser.ts";

export interface MediaQueryState {
  query: string;
  sort: MediaSort;
}

/** Restore only supported media filters; unknown sort values fall back to rating. */
export function readMediaQueryState(search: string): MediaQueryState {
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? "",
    sort: sort === "title" || sort === "year" ? sort : "rating",
  };
}

/** Keep unrelated route parameters and fragments intact when updating filters. */
export function mediaFilterHref(href: string, query: string, sort: MediaSort): string {
  const url = new URL(href);
  url.searchParams.delete("q");
  url.searchParams.delete("sort");
  if (query.trim()) url.searchParams.set("q", query.trim());
  if (sort !== "rating") url.searchParams.set("sort", sort);
  return url.pathname + url.search + url.hash;
}
