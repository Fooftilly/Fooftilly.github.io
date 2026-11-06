import data from "../data/bookmark-categories.json" with { type: "json" };

/** The JSON catalog is the single category definition for Astro, CI and Python audits. */
export interface BookmarkCategory {
  section: string;
  slug: string;
  label: string;
  labelSh: string;
  default?: boolean;
}
export const BOOKMARK_CATEGORIES: readonly BookmarkCategory[] = data;

const sections = new Set<string>();
const slugs = new Set<string>();
for (const category of BOOKMARK_CATEGORIES) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(category.section) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.slug) ||
      !category.label.trim() || !category.labelSh.trim() ||
      sections.has(category.section) || slugs.has(category.slug)) {
    throw new Error("Invalid or duplicated bookmark category: " + category.section);
  }
  sections.add(category.section);
  slugs.add(category.slug);
}
if (BOOKMARK_CATEGORIES.filter(category => category.default).length !== 1) {
  throw new Error("Exactly one default bookmark category must be configured");
}
export function defaultBookmarkCategory(): BookmarkCategory {
  return BOOKMARK_CATEGORIES.find(category => category.default)!;
}
export function categoryBySection(section: string): BookmarkCategory | undefined {
  return BOOKMARK_CATEGORIES.find((item) => item.section === section);
}
export function categoryBySlug(slug: string | undefined): BookmarkCategory | undefined {
  return BOOKMARK_CATEGORIES.find((item) => item.slug === slug);
}
export function draftCategoryFromSlug(raw: string | null): BookmarkCategory["section"] {
  return categoryBySlug(raw ?? "")?.section ?? defaultBookmarkCategory().section;
}
export function bookmarkCategoryPath(slug: string): string {
  return `/bookmarks/${slug}/`;
}
export function bookmarkCategoryFeedPath(slug: string): string {
  return `/bookmarks/${slug}/index.xml`;
}
export function bookmarkCategoryDisplayLabel(label: string, lang: "en" | "sh"): string {
  if (lang === "en") return label;
  return BOOKMARK_CATEGORIES.find((category) => category.label === label)?.labelSh ?? label;
}
