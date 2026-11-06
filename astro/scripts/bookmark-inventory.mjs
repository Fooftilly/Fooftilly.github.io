import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

const source = fileURLToPath(new URL("../../content/bookmarks/", import.meta.url));

/** Validate the current inventory. No historical record is required to survive
 * an intentional Git-reviewed edit, deletion, rename or category change.
 */
export function assertBookmarkInventory(records, label = "Bookmark inventory") {
  assert.ok(Array.isArray(records), label + ": expected an array");
  const categories = new Set(BOOKMARK_CATEGORIES.map(category => category.section));
  const ids = records.map(record => typeof record === "string" ? record : record?.id);
  const seen = new Set();
  for (const id of ids) {
    assert.equal(typeof id, "string", label + ": bookmark ID must be a string");
    const [section, stem, ...extra] = id.split("/");
    assert.ok(categories.has(section) && stem && extra.length === 0 &&
      stem !== "_index" && /^[\p{L}\p{N}_-]+$/u.test(stem),
      label + ": malformed or unknown bookmark ID: " + id);
    assert.ok(!seen.has(id), label + ": duplicate bookmark ID: " + id);
    seen.add(id);
  }
  return ids.length;
}

/** Enumerate every currently published Markdown file, excluding drafts and
 * category index pages. A new source category must have one metadata entry.
 */
export async function readPublishedSourceBookmarkIds() {
  const folders = (await readdir(source, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  const configured = BOOKMARK_CATEGORIES.map(category => category.section).sort();
  assert.deepEqual(folders, configured, "Bookmark source folders and category metadata differ");
  const ids = [];
  for (const {section} of BOOKMARK_CATEGORIES) {
    for (const filename of await readdir(join(source, section))) {
      if (!filename.endsWith(".md") || filename === "_index.md") continue;
      const raw = await readFile(join(source, section, filename), "utf8");
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
      assert.ok(match, "Missing bookmark frontmatter: " + section + "/" + filename);
      const data = parse(match[1]);
      assert.ok(data && typeof data.title === "string" && data.title.trim(),
        "Missing bookmark title: " + section + "/" + filename);
      if (data.draft !== true) ids.push(section + "/" + filename.slice(0, -3));
    }
  }
  assertBookmarkInventory(ids, "Current published source");
  return ids;
}

/** Generated routes, feeds and release input must exactly reflect Git content. */
export async function assertBookmarkSourceParity(records, label = "Bookmark source parity") {
  assertBookmarkInventory(records, label);
  const actual = records.map(record => typeof record === "string" ? record : record.id);
  const expected = await readPublishedSourceBookmarkIds();
  assert.deepEqual([...actual].sort(), [...expected].sort(),
    label + ": generated records do not match current published Markdown");
  return actual.length;
}
