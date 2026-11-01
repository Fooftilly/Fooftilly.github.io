import { getCollection } from "astro:content";
import type { Bookmark } from "./bookmark-filter.ts";
import { categoryBySection } from "./bookmark-categories.ts";

export interface SourceBookmark extends Bookmark {
  // Only used by the staging parity audit; the public Vue browser receives
  // the narrower Bookmark type without private editor-only data.
  rawLink: string;
  comments: string;
}

export async function loadBookmarks(): Promise<SourceBookmark[]> {
  const entries = await getCollection("bookmarks", ({ id, data }) =>
    id !== "_index" && !id.endsWith("/_index") && !data.draft
  );

  return entries.map(({ id, data }) => {
    const section = id.split("/")[0];
    const rawLink = data.link ?? "";
    let url = "";
    try {
      const parsed = new URL(rawLink);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        url = parsed.href;
      }
    } catch {
      // Do not render malformed or unsafe links.
    }
    return {
      id,
      title: data.title,
      category: categoryBySection(section)?.label ?? section,
      url,
      rawLink,
      comments: data.comments ?? "",
      date: data.date?.toISOString().slice(0, 10) ?? "",
    };
  });
}
