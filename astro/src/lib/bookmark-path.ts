import { categoryBySection } from "./bookmark-categories.ts";

/** Derive a predictable lowercase URL from the source category and file stem. */
export function bookmarkDetailPath(id: string): string {
  const [section, filename, ...extra] = id.split("/");
  const category = categoryBySection(section ?? "");
  if (!category || !filename || extra.length || filename === "_index" ||
      filename === "." || filename === ".." || filename.includes("\\") ||
      !/^[\p{L}\p{N}_-]+$/u.test(filename)) {
    throw new Error(`Unsupported bookmark ID: ${id}`);
  }
  return `/bookmarks/${category.slug}/${encodeURIComponent(filename.toLowerCase())}/`;
}

/**
 * Path used by Astro getStaticPaths: use the source file stem rather than
 * a title-derived slug to retain stable, predictable URLs.
 */
export function bookmarkDetailParams(id: string): { category: string; slug: string } {
  const url = bookmarkDetailPath(id);
  const parts = url.split("/");
  return { category: parts[2], slug: decodeURIComponent(parts[3]) };
}
