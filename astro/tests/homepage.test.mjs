import test from "node:test";
import assert from "node:assert/strict";
import { homepageSummary } from "../src/lib/homepage.ts";

test("homepage contains fixed category order and newest eight bookmarks", () => {
  const original = Array.from({ length: 12 }, (_, index) => ({
    id: "Art/" + index, category: "Art", title: "Bookmark " + index,
    date: "2026-11-" + String(index + 1).padStart(2, "0"),
    url: "https://example.com/" + index,
  }));
  const result = homepageSummary(original);
  assert.equal(result.count, 12);
  assert.equal(result.recent.length, 8);
  assert.equal(result.recent[0].id, "Art/11");
  assert.equal(result.recent.at(-1).id, "Art/4");
  assert.equal(result.categories.find((c) => c.section === "Art").count, 12);
  assert.equal(result.categories.length, 7);
  assert.equal(original[0].id, "Art/0", "Source order must not mutate");
});

test("unexpected categories fail rather than disappearing from summary", () => {
  assert.throws(() => homepageSummary([{
    id: "Invalid/one", category: "Unknown", title: "One", date: "", url: "",
  }]), /Unmapped bookmark category/);
});
