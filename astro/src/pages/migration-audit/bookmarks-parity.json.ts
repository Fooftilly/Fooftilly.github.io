import type { APIRoute } from "astro";
import { loadBookmarks } from "../../lib/bookmark-data.ts";

// Temporary staging-only artifact. Delete before turning on Astro publishing
// under roadmap #11. It lets CI compare every source record to Astro's
// actual Content Collection output (not two example markup strings).
export const GET: APIRoute = async () => {
  const records = await loadBookmarks();
  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
