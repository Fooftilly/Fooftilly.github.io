export type BookmarkSort = "newest" | "oldest" | "title";

export interface Bookmark {
  id: string;
  title: string;
  category: string;
  url: string;
  date: string;
}

export interface BookmarkFilters {
  query: string;
  category: string;
  sort: BookmarkSort;
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

/**
 * Pure view selector shared by the Vue browser and later bookmark/category views.
 * Do not mutate the supplied collection: Astro content is the source of truth.
 */
export function filterAndSortBookmarks(
  items: readonly Bookmark[],
  filters: BookmarkFilters,
): Bookmark[] {
  const terms = fold(filters.query.trim()).split(/\s+/).filter(Boolean);
  const filtered = items.filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) return false;
    const haystack = fold([item.title, item.category, item.url].join(" "));
    return terms.every((term) => haystack.includes(term));
  });

  return filtered.sort((a, b) => {
    if (filters.sort === "title") {
      return a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        || a.id.localeCompare(b.id);
    }
    // Unknown dates always sort after known dates in either direction.
    if (!a.date && b.date) return 1;
    if (!b.date && a.date) return -1;
    const dateOrder = filters.sort === "oldest"
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date);
    return dateOrder
      || a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
      || a.id.localeCompare(b.id);
  });
}
