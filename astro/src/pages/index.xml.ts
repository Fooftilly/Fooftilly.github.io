import type { APIRoute } from "astro";
import { loadBookmarks } from "../lib/bookmark-data.ts";
import { renderBookmarkRss, rssResponse } from "../lib/bookmark-rss.ts";

/**
 * Astro's site-wide activity feed. There are currently no published post
 * records; bookmarks are the entire available public activity stream.
 */
export const GET: APIRoute = async () => rssResponse(renderBookmarkRss({
  title: "Nikola Perović — Latest bookmarks",
  description: "Recently saved links from every bookmark category",
  path: "/index.xml",
  bookmarks: await loadBookmarks(),
}));
