import { BOOKMARK_CATEGORIES, bookmarkCategoryPath } from "./bookmark-categories.ts";
import { bookmarkDetailPath } from "./bookmark-path.ts";

export const SITE_ORIGIN = "https://www.peroniko.xyz";

/**
 * The routes that exist in the *current* Astro build. This is deliberately not
 * a wish list of unimplemented routes: include additional pages as they are migrated.
 */
export function getPublishedPaths(bookmarkIds: readonly string[]): string[] {
  const paths = [
    "/",
    "/about/",
    "/sr/",
    "/sr/about/",
    "/posts/",
    "/sr/posts/",
    "/search/",
    "/sr/search/",
    "/bookmarks/",
    "/new-bookmark/",
    "/media/",
    "/music/",
    "/films/",
    "/tv/",
    "/new-media/",
    "/privacy/",
    "/sr/privacy/",
    ...BOOKMARK_CATEGORIES.map((category) => bookmarkCategoryPath(category.slug)),
    ...bookmarkIds.map(bookmarkDetailPath),
  ];
  const seen = new Set<string>();
  for (const path of paths) {
    if (!path.startsWith("/") || !path.endsWith("/") || seen.has(path)) {
      throw new Error(`Invalid or duplicate sitemap path: ${path}`);
    }
    seen.add(path);
  }
  return paths.sort();
}

export function absoluteSiteUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`Path must be site-relative: ${path}`);
  }
  return new URL(path, SITE_ORIGIN).href;
}

export function xmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderSitemap(paths: readonly string[]): string {
  const entries = paths.map((path) => `  <url><loc>${xmlText(absoluteSiteUrl(path))}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>
`;
}
