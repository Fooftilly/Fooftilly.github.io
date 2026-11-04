import type { APIRoute } from "astro";
import { loadBookmarks } from "../../lib/bookmark-data.ts";
import { renderBookmarkRss, rssResponse } from "../../lib/bookmark-rss.ts";

/** Includes all public bookmarks across their source categories. */
export const GET: APIRoute = async () => rssResponse(renderBookmarkRss({
  title: "Peroniko — Bookmarks",
  description: "All public bookmarks across seven categories",
  path: "/bookmarks/index.xml",
  bookmarks: await loadBookmarks(),
}));
