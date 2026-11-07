import { bookmarkCategoryDisplayLabel } from "./bookmark-categories.ts";

export type BookmarkSort = "newest" | "oldest" | "title";

export interface Bookmark {
  id: string;
  title: string;
  category: string;
  url: string;
  date: string;
  /** Canonical first-party detail page, available for every saved bookmark. */
  detailUrl?: string;
  notesUrl?: string;
  /** Short, already-public Markdown frontmatter comment (not private notes). */
  comments?: string;
  /** Optional source-owned labels, not a fixed taxonomy. */
  tags?: string[];
}

export interface BookmarkFilters {
  query: string;
  category: string;
  sort: BookmarkSort;
  tag?: string;
  lang?: "en" | "sh";
}

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

/**
 * Pure view selector shared by the Vue browser and later bookmark/category views.
 * Do not mutate the supplied collection: Astro content is the source of truth.
 */
export function filterAndSortBookmarks<T extends Bookmark>(
  items: readonly T[],
  filters: BookmarkFilters,
): T[] {
  const terms = fold(filters.query.trim()).split(/\s+/).filter(Boolean);
  const activeTag = filters.tag?.normalize("NFC").toLowerCase();
  const filtered = items.filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (activeTag && !(item.tags ?? []).some(tag =>
      tag.normalize("NFC").toLowerCase() === activeTag)) return false;
    const translatedCategory = filters.lang === "sh" ? bookmarkCategoryDisplayLabel(item.category, "sh") : "";
    const haystack = fold([item.title, item.category, translatedCategory, item.url, item.comments ?? "", ...(item.tags ?? [])].join(" "));
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

/** Static HTML contains the entire Git-owned collection so the site remains
 * usable without JavaScript. After hydration, Vue progressively limits DOM
 * rows while keeping counts and filtering based on the complete source.
 */
export const BOOKMARK_PAGE_SIZE = 50;
export function visibleBookmarkPage<T>(matches: readonly T[], limit: number, hydrated: boolean): readonly T[] {
  return hydrated ? matches.slice(0, Math.max(0, Math.floor(limit))) : matches;
}
