/** Verify the actual rendered table contents against each reviewed public
 * catalog record; row counts alone cannot detect omissions or substitutions.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRatingsCatalog } from "../src/lib/ratings.ts";

function decodeHtml(text) {
  return text.replace(/&(?:#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (entity) => {
    const bare = entity.slice(1, -1).toLowerCase();
    if (bare.startsWith("#x")) return String.fromCodePoint(parseInt(bare.slice(2), 16));
    if (bare.startsWith("#")) return String.fromCodePoint(parseInt(bare.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[bare] ?? entity;
  });
}
function textContent(fragment) {
  return decodeHtml(fragment.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

export function verifyRenderedCatalog(html, catalog, kind) {
  const items = validateRatingsCatalog(catalog, kind).items;
  const label = kind === "music" ? "Music" : "Film";
  assert.ok(html.includes("<h1>" + label + " ratings</h1>"), "Missing ratings page h1: " + kind);
  assert.ok(html.includes("<title>" + label + " ratings · Nikola Perović</title>"), "Missing page metadata: " + kind);
  if (!items.length) {
    assert.ok(html.includes("No " + (kind === "music" ? "music" : "film") + " ratings have been published yet."),
      "Missing truthful empty state");
    assert.ok(!html.includes("<tbody"), "Empty catalog must not show an invented rating table");
  } else {
    const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    assert.ok(body, "Missing populated rating table");
    const rows = [...body[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)];
    assert.equal(rows.length, items.length, "Rendered rating rows do not match catalog length");
    for (let index = 0; index < items.length; index++) {
      const expected = items[index];
      const row = rows[index][1];
      const cells = [...row.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(match => textContent(match[2]));
      assert.deepEqual(cells, [
        expected.title, expected.artist ?? "—", expected.year === undefined ? "—" : String(expected.year),
        expected.rating.toFixed(1) + " / 5",
      ], "Rendered rating differs from source catalog at row " + (index + 1));
      const ratingLabel = expected.rating + " out of 5 stars";
      assert.ok(row.includes('aria-label="' + ratingLabel + '"'),
        "Missing/incorrect accessible rating label at row " + (index + 1));
      const link = row.match(/<a\b[^>]*href="([^"]+)"[^>]*>/);
      if (expected.url) {
        assert.ok(link, "Expected source link missing at row " + (index + 1));
        assert.equal(decodeHtml(link[1]), expected.url, "Rendered source URL differs from catalog");
        assert.ok(/rel="[^"]*noopener[^"]*noreferrer[^"]*"/.test(link[0]), "External link must be protected");
      } else assert.equal(link, null, "Unexpected external link at row " + (index + 1));
    }
  }
  assert.ok(!html.includes('src="https://www.googletagmanager.com/'),
    "Ratings page may not preload Google Analytics");
}

async function main() {
  for (const kind of ["music", "films"]) {
    const data = JSON.parse(await readFile("src/data/" + kind + "-ratings.json", "utf8"));
    const html = await readFile("dist/" + kind + "/index.html", "utf8");
    verifyRenderedCatalog(html, data, kind);
    console.log(kind + ": " + data.items.length + " real public ratings checked against rendered output");
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
