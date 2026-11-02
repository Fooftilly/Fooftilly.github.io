import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

const records = JSON.parse(await readFile(".audit/bookmarks-parity.json", "utf8"));
assert.equal(records.length, 576);
for (const [path, language, heading] of [
  ["dist/index.html", "en", "Bookmark collections"],
  ["dist/sr/index.html", "sr-Latn", "Kolekcije linkova"],
]) {
  const html = await readFile(path, "utf8");
  assert.ok(html.includes('lang="' + language + '"'), "Language missing: " + path);
  assert.ok(html.includes(heading), "Collections missing: " + path);
  assert.ok(!html.includes("Astro migration preview"), "Technical placeholder leaked: " + path);
  assert.ok(!html.includes("Hugo na Astro"), "Serbian preview placeholder leaked: " + path);
  assert.ok(!html.includes("/new-bookmark/"), "Private admin link leaked: " + path);
  assert.ok(html.includes("576"), "Bookmark count missing: " + path);
  for (const category of BOOKMARK_CATEGORIES) {
    assert.ok(html.includes('/bookmarks/' + category.slug + '/'),
      "Missing category " + category.slug + " on " + path);
    assert.ok(html.includes(language === "en" ? category.label : category.labelSr),
      "Missing category label " + category.slug + " on " + path);
  }
  const latest = html.match(/<ul class="recent-grid"[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(latest, "Recent list missing: " + path);
  assert.equal((latest[1].match(/<li\b/g) ?? []).length, 8,
    "Homepage must show only the latest eight entries");
}
console.log("English/Serbian homepages: seven categories, 576 bookmarks, eight recent items; no preview/admin links");
