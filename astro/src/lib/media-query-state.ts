import type { MediaSort, MediaStatusFilter } from "./media-browser.ts";

export interface MediaQueryState {
  query: string;
  sort: MediaSort;
  status: MediaStatusFilter;
}

/** Restore only supported media filters; unknown sort values fall back to rating. */
export function readMediaQueryState(search: string): MediaQueryState {
  const params = new URLSearchParams(search);
  const sort = params.get("sort");
  const requestedStatus = params.get("status");
  const status: MediaStatusFilter = requestedStatus === "finished" || requestedStatus === "in-progress" || requestedStatus === "planned" || requestedStatus === "unspecified" ? requestedStatus : "all";
  return {
    query: params.get("q") ?? "",
    sort: sort === "title" || sort === "year" ? sort : "rating",
    status,
  };
}

/** Keep unrelated route parameters and fragments intact when updating filters. */
export function mediaFilterHref(href: string, query: string, sort: MediaSort, status: MediaStatusFilter = "all"): string {
  const url = new URL(href);
  url.searchParams.delete("q");
  url.searchParams.delete("sort");
  url.searchParams.delete("status");
  if (query.trim()) url.searchParams.set("q", query.trim());
  if (sort !== "rating") url.searchParams.set("sort", sort);
  if (status !== "all") url.searchParams.set("status", status);
  return url.pathname + url.search + url.hash;
}
