import type { MediaSort, MediaStatusFilter } from "./media-browser.ts";

export interface MediaQueryState {
  query: string;
  sort: MediaSort;
  status: MediaStatusFilter;
  minRating: number;
}

/** Restore only supported media filters; unknown sort values fall back to rating. */
export function readMediaQueryState(search: string): MediaQueryState {
  const params = new URLSearchParams(search);
  const requestedRating = params.get("min_rating") ?? "";
  const numeric = Number(requestedRating);
  const minRating = /^(?:0\.5|[1-4](?:\.[05])?|5(?:\.0)?)$/.test(requestedRating) &&
    numeric >= 0.5 && numeric <= 5 && Number.isInteger(numeric * 2) ? numeric : 0;
  const sort = params.get("sort");
  const requestedStatus = params.get("status");
  const status: MediaStatusFilter = requestedStatus === "finished" || requestedStatus === "in-progress" || requestedStatus === "planned" || requestedStatus === "unspecified" ? requestedStatus : "all";
  return {
    query: params.get("q") ?? "",
    sort: sort === "title" || sort === "year" ? sort : "rating",
    status,
    minRating,
  };
}

/** Keep unrelated route parameters and fragments intact when updating filters. */
export function mediaFilterHref(href: string, query: string, sort: MediaSort, status: MediaStatusFilter = "all", minRating = 0): string {
  const url = new URL(href);
  url.searchParams.delete("q");
  url.searchParams.delete("sort");
  url.searchParams.delete("status");
  url.searchParams.delete("min_rating");
  if (query.trim()) url.searchParams.set("q", query.trim());
  if (sort !== "rating") url.searchParams.set("sort", sort);
  if (status !== "all") url.searchParams.set("status", status);
  if (minRating > 0) url.searchParams.set("min_rating", String(minRating));
  return url.pathname + url.search + url.hash;
}
