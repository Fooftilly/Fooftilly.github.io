import type { APIRoute } from "astro";
import { loadBookmarks } from "../../lib/bookmark-data.ts";

// Temporary staging-only artifact. Delete before turning on Astro publishing
// under roadmap #11. It lets CI compare every source record to Astro's
// actual Content Collection output (not two example markup strings).
export const GET: APIRoute = async () => {
  // The route exists solely to materialize the CI parity artifact during a
  // static build. It must never expose the manifest on a development server.
  // npm run build also strips this route from the published dist/ tree.
  if (import.meta.env.DEV) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const records = await loadBookmarks();
  return new Response(JSON.stringify(records), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
