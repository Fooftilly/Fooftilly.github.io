/**
 * Source Markdown category names and canonical lowercase URL slugs.
 * These shared identifiers power navigation, filtering and feeds.
 */
export const BOOKMARK_CATEGORIES = [
  { section: "Art", slug: "art", label: "Art", labelSh: "Umjetnost" },
  { section: "Fun", slug: "fun", label: "Fun", labelSh: "Zabava" },
  { section: "Music", slug: "music", label: "Music", labelSh: "Muzika" },
  { section: "PaperBookArticle", slug: "paperbookarticle", label: "Articles & books", labelSh: "Članci i knjige" },
  { section: "Perspectives", slug: "perspectives", label: "Perspectives", labelSh: "Perspektive" },
  { section: "Resource", slug: "resource", label: "Resources", labelSh: "Resursi" },
  { section: "YouTube", slug: "youtube", label: "YouTube", labelSh: "YouTube" },
] as const;

export type BookmarkCategory = (typeof BOOKMARK_CATEGORIES)[number];

export function categoryBySection(section: string): BookmarkCategory | undefined {
  return BOOKMARK_CATEGORIES.find((item) => item.section === section);
}

export function categoryBySlug(slug: string | undefined): BookmarkCategory | undefined {
  return BOOKMARK_CATEGORIES.find((item) => item.slug === slug);
}

/** Only canonical public category slugs may preselect a new bookmark draft. */
export function draftCategoryFromSlug(raw: string | null): BookmarkCategory["section"] {
  return categoryBySlug(raw ?? "")?.section ?? "Resource";
}

export function bookmarkCategoryPath(slug: string): string {
  return `/bookmarks/${slug}/`;
}

export function bookmarkCategoryFeedPath(slug: string): string {
  return `/bookmarks/${slug}/index.xml`;
}

/** UI-only translation: never change canonical category keys or URL slugs. */
export function bookmarkCategoryDisplayLabel(label: string, lang: "en" | "sh"): string {
  if (lang === "en") return label;
  return BOOKMARK_CATEGORIES.find((category) => category.label === label)?.labelSh ?? label;
}
