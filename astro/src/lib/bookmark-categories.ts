/**
 * Hugo section names and their existing public lowercase URL slugs.
 * These names are content-routing compatibility data, not UI guesses.
 */
export const BOOKMARK_CATEGORIES = [
  { section: "Art", slug: "art", label: "Art" },
  { section: "Fun", slug: "fun", label: "Fun" },
  { section: "Music", slug: "music", label: "Music" },
  { section: "PaperBookArticle", slug: "paperbookarticle", label: "Articles & books" },
  { section: "Perspectives", slug: "perspectives", label: "Perspectives" },
  { section: "Resource", slug: "resource", label: "Resources" },
  { section: "YouTube", slug: "youtube", label: "YouTube" },
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
