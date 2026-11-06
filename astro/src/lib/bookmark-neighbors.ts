import { categoryBySection } from "./bookmark-categories.ts";

export interface BookmarkNeighbor { id: string; title: string; date: string }
export interface BookmarkAdjacency {
  previous?: BookmarkNeighbor;
  next?: BookmarkNeighbor;
}

/** Stable, category-local, newest-first reading order.
 * Missing dates follow known dates. Titles/IDs break equal-date ties.
 * No source content is modified and no runtime service is needed.
 */
export function bookmarkNeighborMap(items: readonly BookmarkNeighbor[]): Map<string,BookmarkAdjacency> {
  const groups = new Map<string,BookmarkNeighbor[]>();
  for (const item of items) {
    const [section, stem, ...extra] = item.id.split("/");
    if (!categoryBySection(section ?? "") || !stem || extra.length)
      throw new Error("Invalid bookmark ID in neighbor map: "+item.id);
    const group = groups.get(section) ?? [];
    group.push(item);
    groups.set(section, group);
  }
  const neighbors = new Map<string,BookmarkAdjacency>();
  for (const group of groups.values()) {
    const sorted=[...group].sort((a,b) => {
      if (!a.date && b.date) return 1;
      if (!b.date && a.date) return -1;
      return b.date.localeCompare(a.date)
        || a.title.localeCompare(b.title,undefined,{sensitivity:"base"})
        || a.id.localeCompare(b.id);
    });
    for (const [index, entry] of sorted.entries()) {
      if (neighbors.has(entry.id)) throw new Error("Duplicate bookmark in neighbor map: "+entry.id);
      neighbors.set(entry.id, {previous:sorted[index-1],next:sorted[index+1]});
    }
  }
  return neighbors;
}
