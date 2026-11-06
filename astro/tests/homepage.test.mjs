import test from "node:test";
import assert from "node:assert/strict";
import { homepageSummary } from "../src/lib/homepage.ts";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

test("homepage follows configured category order and shows the newest eight records", () => {
  const category = BOOKMARK_CATEGORIES[0];
  const original = Array.from({ length: 12 }, (_, index) => ({
    id: category.section + "/" + index, category: category.label, title: "Bookmark " + index,
    date: "2026-11-" + String(index + 1).padStart(2, "0"),
    url: "https://example.com/" + index,
  }));
  const result = homepageSummary(original);
  assert.equal(result.count, 12);
  assert.equal(result.recent.length, 8);
  assert.equal(result.recent[0].id, category.section + "/11");
  assert.equal(result.recent.at(-1).id, category.section + "/4");
  assert.equal(result.categories.find(c => c.section === category.section).count, 12);
  assert.deepEqual(result.categories.map(c => c.section), BOOKMARK_CATEGORIES.map(c => c.section));
  assert.equal(original[0].id, category.section + "/0", "Source order must not mutate");
});

test("empty bookmark collection is valid and still lists configured categories", () => {
  const result = homepageSummary([]);
  assert.equal(result.count, 0);
  assert.deepEqual(result.recent, []);
  assert.deepEqual(result.categories.map(c => c.count), BOOKMARK_CATEGORIES.map(() => 0));
});

test("unexpected categories fail rather than disappearing from summary", () => {
  assert.throws(() => homepageSummary([{
    id: "Invalid/one", category: "Unknown", title: "One", date: "", url: "",
  }]), /Unmapped bookmark category/);
});
