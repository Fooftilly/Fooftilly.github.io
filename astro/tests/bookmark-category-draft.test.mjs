import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKMARK_CATEGORIES, categoryBySlug, defaultBookmarkCategory, draftCategoryFromSlug,
} from "../src/lib/bookmark-categories.ts";

test("each canonical public category slug preselects the matching source folder", () => {
  assert.ok(BOOKMARK_CATEGORIES.length > 0);
  for (const category of BOOKMARK_CATEGORIES) {
    const query = new URLSearchParams({category: category.slug});
    assert.equal(draftCategoryFromSlug(query.get("category")), category.section);
    assert.equal(categoryBySlug(category.slug)?.label, category.label);
  }
});

test("unrecognized and unsafe category parameters use the configured default", () => {
  const fallback = defaultBookmarkCategory().section;
  for (const raw of [
    null, "", "nonexistent", "../not-registered", "/unknown",
    "%2F..", "__proto__", "invalid%2Fpath",
  ]) {
    assert.equal(draftCategoryFromSlug(raw), fallback, String(raw));
  }
});

test("category selection does not discard captured URL or title", () => {
  const category = BOOKMARK_CATEGORIES.at(-1);
  const params = new URLSearchParams({
    category: category.slug,
    url: "https://example.org/a?x=1&y=2",
    title: "Saved research article",
  });
  assert.equal(draftCategoryFromSlug(params.get("category")), category.section);
  assert.equal(params.get("url"), "https://example.org/a?x=1&y=2");
  assert.equal(params.get("title"), "Saved research article");
});
