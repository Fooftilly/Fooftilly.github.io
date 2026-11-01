import type { APIRoute } from "astro";
import { loadBookmarks } from "../../lib/bookmark-data.ts";
import { renderBookmarkRss, rssResponse } from "../../lib/bookmark-rss.ts";

/** Unlike the legacy Hugo root feed, includes every nested bookmark category. */
export const GET: APIRoute = async () => rssResponse(renderBookmarkRss({
  title: "Nikola Perović — Bookmarks",
  description: "All public bookmarks across seven categories",
  path: "/bookmarks/index.xml",
  bookmarks: await loadBookmarks(),
}));
