import { categoryBySection } from "./bookmark-categories.ts";

/** Match Hugo's file-based bookmark paths without title-derived slug changes. */
export function bookmarkDetailPath(id: string): string {
  const [section, filename, ...extra] = id.split("/");
  const category = categoryBySection(section ?? "");
  if (!category || !filename || extra.length || filename === "_index" ||
      filename === "." || filename === ".." || filename.includes("\\") ||
      !/^[\p{L}\p{N}_-]+$/u.test(filename)) {
    throw new Error(`Unsupported legacy bookmark ID: ${id}`);
  }
  return `/bookmarks/${category.slug}/${encodeURIComponent(filename.toLowerCase())}/`;
}

/**
 * Path used by Astro getStaticPaths: it must be the same path as Hugo's
 * directory and file stem, not a regenerated title slug.
 */
export function bookmarkDetailParams(id: string): { category: string; slug: string } {
  const url = bookmarkDetailPath(id);
  const parts = url.split("/");
  return { category: parts[2], slug: decodeURIComponent(parts[3]) };
}
