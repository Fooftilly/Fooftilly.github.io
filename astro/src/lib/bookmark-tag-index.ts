/** Counts for public, Git-owned bookmark labels. Per-record deduplication
 * prevents a malformed or repeated label from inflating the directory.
 */
export interface BookmarkTagCount { label: string; count: number }
export function bookmarkTagCounts(bookmarks: readonly { tags?: readonly string[] }[]): BookmarkTagCount[] {
  const summary = new Map<string, BookmarkTagCount>();
  for (const bookmark of bookmarks) {
    const visited = new Set<string>();
    for (const raw of bookmark.tags ?? []) {
      const label = raw.normalize("NFC");
      const key = label.toLowerCase();
      if (!label || visited.has(key)) continue;
      visited.add(key);
      const previous = summary.get(key);
      if (previous) previous.count++;
      else summary.set(key,{label,count:1});
    }
  }
  return [...summary.values()].sort((a,b)=>
    b.count-a.count || a.label.localeCompare(b.label,"en",{sensitivity:"base"}));
}
