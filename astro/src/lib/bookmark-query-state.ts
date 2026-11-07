import type { BookmarkSort } from "./bookmark-filter.ts";

export interface BookmarkQueryState {
  query: string;
  category: string;
  sort: BookmarkSort;
  /** Exact public tag label, empty when no tag is selected. */
  tag: string;
}

/** Only restore categories that exist in the current page's own collection.
 * Category-specific pages cannot expose hidden category filters.
 */
export function readBookmarkQueryState(
  search: string, availableCategories: readonly string[], availableTags: readonly string[] = [],
): BookmarkQueryState {
  const params = new URLSearchParams(search);
  const requestedCategory = params.get("category");
  const requestedSort = params.get("sort");
  const requestedTag = params.get("tag")?.normalize("NFC").toLowerCase();
  const tag = availableTags.find(candidate =>
    candidate.normalize("NFC").toLowerCase() === requestedTag) ?? "";
  return {
    query: (params.get("q") ?? "").trim(),
    category: availableCategories.length > 1 && requestedCategory &&
      availableCategories.includes(requestedCategory) ? requestedCategory : "all",
    sort: requestedSort === "title" || requestedSort === "oldest" ? requestedSort : "newest",
    tag,
  };
}

/** Update only public bookmark filters; preserve unrelated parameters/hash. */
export function bookmarkFilterHref(href: string, state: BookmarkQueryState): string {
  const next = new URL(href);
  for (const key of ["q", "category", "sort", "tag"]) next.searchParams.delete(key);
  if (state.query.trim()) next.searchParams.set("q", state.query.trim());
  if (state.category !== "all") next.searchParams.set("category", state.category);
  if (state.sort !== "newest") next.searchParams.set("sort", state.sort);
  if (state.tag) next.searchParams.set("tag", state.tag);
  return next.pathname + next.search + next.hash;
}

/** An actual navigation target, even when Vue has not hydrated. */
export function bookmarkTagSearchHref(tag: string, lang: "en" | "sh" = "en"): string {
  const params = new URLSearchParams({ tag });
  return (lang === "sh" ? "/sh/search/" : "/search/") + "?" + params;
}
