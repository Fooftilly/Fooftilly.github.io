import type { APIRoute } from "astro";
import { loadBookmarks } from "../lib/bookmark-data.ts";
import { getPublishedPaths, renderSitemap } from "../lib/site-index.ts";

export const GET: APIRoute = async () => {
  const bookmarks = await loadBookmarks();
  return new Response(renderSitemap(getPublishedPaths(bookmarks.map((entry) => entry.id))), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
