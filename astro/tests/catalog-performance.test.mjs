import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG_ROUTES, countStaticRows, measureStaticPage, median } from "../scripts/catalog-performance.mjs";

test("measures media HTML from the current rendered output, not historical item totals", () => {
  const html = '<astro-island props="&quot;one&quot;">' +
    '<table><tbody><tr data-media-row><th>First</th></tr>' +
    '<tr class="item" data-media-row=""><th>Second</th></tr></tbody></table></astro-island>';
  const size = measureStaticPage(html, "media");
  assert.equal(size.ssr_rows, 2);
  assert.equal(size.island_count, 1);
  assert.equal(size.island_props_attribute_bytes, Buffer.byteLength("&quot;one&quot;"));
  assert.equal(size.html_bytes, Buffer.byteLength(html));
  assert.ok(size.html_gzip_bytes > 0);
  assert.ok(size.html_brotli_bytes > 0);
});

test("counts bookmark entries with other classes and skips ordinary lists", () => {
  const html = '<li class="item bookmark-entry" data-x="1"></li>' +
    '<li class="bookmark-entry"></li><li class="unrelated"></li>';
  assert.equal(countStaticRows(html, "bookmarks"), 2);
  assert.equal(measureStaticPage(html, "bookmarks").ssr_rows, 2);
  assert.throws(() => countStaticRows(html, "unknown"), /Unknown catalog kind/);
});

test("uses reproducible, source-independent routes and robust sample medians", () => {
  assert.deepEqual(CATALOG_ROUTES.map(item => item.path), ["/films/", "/music/", "/bookmarks/"]);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.throws(() => median([]), /Expected nonempty/);
  assert.throws(() => median([2, NaN]), /Expected nonempty/);
});
