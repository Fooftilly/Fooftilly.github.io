import type { APIRoute } from "astro";
import { loadBookmarks } from "../lib/bookmark-data.ts";
import { getCollection } from "astro:content";
import { getPublishedPaths, renderSitemap } from "../lib/site-index.ts";

export const GET: APIRoute = async () => {
  const [bookmarks,projects] = await Promise.all([loadBookmarks(),getCollection("projects")]);
  return new Response(renderSitemap(getPublishedPaths(bookmarks.map((entry) => entry.id),projects.map((entry) => entry.id))), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
