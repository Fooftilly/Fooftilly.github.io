import { getCollection } from "astro:content";
import type { Bookmark } from "./bookmark-filter.ts";
import { categoryBySection } from "./bookmark-categories.ts";
import { bookmarkDetailPath } from "./bookmark-path.ts";
import { publicBookmarkUrl } from "./bookmark-public-url.ts";

export interface SourceBookmark extends Bookmark {
  // Only used by the staging parity audit; the public Vue browser receives
  // the narrower Bookmark type without private editor-only data.
  rawLink: string;
  comments: string;
  detailUrl: string;
}

export async function loadBookmarks(): Promise<SourceBookmark[]> {
  const entries = await getCollection("bookmarks", ({ id, data }) =>
    id !== "_index" && !id.endsWith("/_index") && !data.draft
  );

  return entries.map(({ id, data, body }) => {
    const section = id.split("/")[0];
    const rawLink = data.link ?? "";
    const url = publicBookmarkUrl(rawLink);
    const detailUrl = bookmarkDetailPath(id);
    return {
      id,
      title: data.title,
      category: categoryBySection(section)?.label ?? section,
      url,
      detailUrl,
      rawLink,
      comments: data.comments ?? "",
      date: data.date?.toISOString().slice(0, 10) ?? "",
      notesUrl: body?.trim() ? detailUrl : "",
    };
  });
}
