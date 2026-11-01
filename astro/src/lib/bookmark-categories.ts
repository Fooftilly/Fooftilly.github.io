/**
 * Source Markdown category names and canonical lowercase URL slugs.
 * These shared identifiers power navigation, filtering and feeds.
 */
export const BOOKMARK_CATEGORIES = [
  { section: "Art", slug: "art", label: "Art", labelSr: "Umjetnost" },
  { section: "Fun", slug: "fun", label: "Fun", labelSr: "Zabava" },
  { section: "Music", slug: "music", label: "Music", labelSr: "Muzika" },
  { section: "PaperBookArticle", slug: "paperbookarticle", label: "Articles & books", labelSr: "Članci i knjige" },
  { section: "Perspectives", slug: "perspectives", label: "Perspectives", labelSr: "Perspektive" },
  { section: "Resource", slug: "resource", label: "Resources", labelSr: "Resursi" },
  { section: "YouTube", slug: "youtube", label: "YouTube", labelSr: "YouTube" },
] as const;

export type BookmarkCategory = (typeof BOOKMARK_CATEGORIES)[number];

export function categoryBySection(section: string): BookmarkCategory | undefined {
  return BOOKMARK_CATEGORIES.find((item) => item.section === section);
}

export function categoryBySlug(slug: string | undefined): BookmarkCategory | undefined {
  return BOOKMARK_CATEGORIES.find((item) => item.slug === slug);
}

export function bookmarkCategoryPath(slug: string): string {
  return `/bookmarks/${slug}/`;
}

export function bookmarkCategoryFeedPath(slug: string): string {
  return `/bookmarks/${slug}/index.xml`;
}

/** UI-only translation: never change canonical category keys or URL slugs. */
export function bookmarkCategoryDisplayLabel(label: string, lang: "en" | "sr"): string {
  if (lang === "en") return label;
  return BOOKMARK_CATEGORIES.find((category) => category.label === label)?.labelSr ?? label;
}
