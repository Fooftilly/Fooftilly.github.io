import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKMARK_CATEGORIES, categoryBySlug, draftCategoryFromSlug,
} from "../src/lib/bookmark-categories.ts";

test("each canonical public category slug preselects its exact source section", () => {
  assert.equal(BOOKMARK_CATEGORIES.length, 7);
  for (const category of BOOKMARK_CATEGORIES) {
    const query = new URLSearchParams({category:category.slug});
    assert.equal(draftCategoryFromSlug(query.get("category")), category.section);
    assert.equal(categoryBySlug(category.slug)?.label, category.label);
  }
});

test("unrecognized or missing category parameters cannot select arbitrary content directories", () => {
  for (const raw of [
    null, "", "nonexistent", "paperbookarticle/", "PaperBookArticle",
    "../Music", "MUSIC", "/music", "music%2F..", "__proto__",
  ]) {
    assert.equal(draftCategoryFromSlug(raw), "Resource", String(raw));
  }
});

test("category selection is independent of captured URL/title query params", () => {
  const params = new URLSearchParams({
    category: "paperbookarticle",
    url: "https://example.org/a?x=1&y=2",
    title: "Saved research article",
  });
  assert.equal(draftCategoryFromSlug(params.get("category")), "PaperBookArticle");
  assert.equal(params.get("url"), "https://example.org/a?x=1&y=2");
  assert.equal(params.get("title"), "Saved research article");
});
