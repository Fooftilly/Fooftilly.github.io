import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";
import {
  assertBookmarkInventory, assertBookmarkSourceParity, readPublishedSourceBookmarkIds,
} from "../scripts/bookmark-inventory.mjs";

const base = fileURLToPath(new URL("../../content/bookmarks/", import.meta.url));

test("every current published Markdown file has valid metadata and a unique ID", async () => {
  const ids = await readPublishedSourceBookmarkIds();
  assert.equal(await assertBookmarkSourceParity(ids, "Published bookmark source"), ids.length);
  for (const id of ids) {
    const [section, stem] = id.split("/");
    const filename = path.join(base, section, stem + ".md");
    const raw = await readFile(filename, "utf8");
    assert.match(raw, /^---\s*\n/m, id + ": frontmatter");
    assert.match(raw, /^title:\s*.+$/m, id + ": title");
  }
});

test("reviewed additions, renames, removals and empty categories do not depend on historical IDs", () => {
  const first = BOOKMARK_CATEGORIES[0].section;
  const second = BOOKMARK_CATEGORIES.at(-1).section;
  assert.equal(assertBookmarkInventory([first + "/one", second + "/two"]), 2);
  assert.equal(assertBookmarkInventory([first + "/renamed"]), 1);
  assert.equal(assertBookmarkInventory([]), 0);
  assert.throws(() => assertBookmarkInventory([first + "/one", first + "/one"]), /duplicate/);
  assert.throws(() => assertBookmarkInventory(["Unregistered/one"]), /unknown/);
  assert.throws(() => assertBookmarkInventory([first + "/nested/path"]), /malformed/);
});
