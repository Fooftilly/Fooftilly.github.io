import { filterAndSortBookmarks } from "./bookmark-filter.ts";
import { bookmarkDetailPath } from "./bookmark-path.ts";
import type { SourceBookmark } from "./bookmark-data.ts";

export const SITE_URL = "https://www.peroniko.xyz";

function escapeXml(value: string): string {
  // Valid XML 1.0 character range (plus basic markup entity escaping).
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface FeedOptions {
  title: string;
  description: string;
  path: string;
  bookmarks: readonly SourceBookmark[];
}

/** Build valid static RSS 2.0 with stable per-record identity and newest-first order. */
export function renderBookmarkRss({ title, description, path, bookmarks }: FeedOptions): string {
  const feedLink = new URL(path, SITE_URL).href;
  const sorted = filterAndSortBookmarks(bookmarks, {
    query: "", category: "all", sort: "newest",
  });
  const items = sorted.map((item) => {
    // When the original source is unavailable or unsafe, link to this
    // specific first-party detail page instead of the generic index.
    const url = item.url || new URL(item.detailUrl || bookmarkDetailPath(item.id), SITE_URL).href;
    const description = item.comments || item.title;
    const pubDate = item.date
      ? `\n      <pubDate>${escapeXml(new Date(`${item.date}T00:00:00Z`).toUTCString())}</pubDate>`
      : "";
    return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="false">${escapeXml(`urn:peroniko:bookmark:${item.id}`)}</guid>
      <description>${escapeXml(description)}</description>${pubDate}
    </item>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(feedLink.replace(/index\.xml$/, ""))}</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}

export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
