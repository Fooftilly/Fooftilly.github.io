import type { APIRoute, GetStaticPaths } from "astro";
import { BOOKMARK_CATEGORIES, categoryBySlug, bookmarkCategoryFeedPath } from "../../../lib/bookmark-categories.ts";
import { loadBookmarks } from "../../../lib/bookmark-data.ts";
import { renderBookmarkRss, rssResponse } from "../../../lib/bookmark-rss.ts";

export const getStaticPaths = (() => BOOKMARK_CATEGORIES.map((category) => ({
  params: { category: category.slug },
}))) satisfies GetStaticPaths;

export const GET: APIRoute = async ({ params }) => {
  const category = categoryBySlug(params.category);
  if (!category) return new Response("Not found", { status: 404 });
  const bookmarks = (await loadBookmarks()).filter(
    (entry) => entry.id.startsWith(`${category.section}/`)
  );
  return rssResponse(renderBookmarkRss({
    title: `Peroniko — ${category.label} bookmarks`,
    description: `Bookmarks in ${category.label}`,
    path: bookmarkCategoryFeedPath(category.slug),
    bookmarks,
  }));
};
