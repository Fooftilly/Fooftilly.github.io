import type { Bookmark } from "./bookmark-filter.ts";
import { filterAndSortBookmarks } from "./bookmark-filter.ts";
import { BOOKMARK_CATEGORIES } from "./bookmark-categories.ts";

export function homepageSummary(items: readonly Bookmark[]) {
  const recent = filterAndSortBookmarks(items, {
    query: "", category: "all", sort: "newest",
  }).slice(0, 8);
  const categories = BOOKMARK_CATEGORIES.map((category) => ({
    ...category,
    count: items.filter((item) => item.category === category.label).length,
  }));
  if (categories.reduce((total, item) => total + item.count, 0) !== items.length) {
    throw new Error("Unmapped bookmark category in homepage data");
  }
  return { count: items.length, recent, categories };
}
