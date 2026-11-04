/** Fail closed if the two generated ratings pages omit, miscount or
 * incorrectly expose the owner's curated public catalogs.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateRatingsCatalog } from "../src/lib/ratings.ts";

for (const [kind, label] of [["music", "Music"], ["films", "Film"]]) {
  const data = JSON.parse(await readFile("src/data/" + kind + "-ratings.json", "utf8"));
  const catalog = validateRatingsCatalog(data, kind);
  const html = await readFile("dist/" + kind + "/index.html", "utf8");
  assert.ok(html.includes("<h1>" + label + " ratings</h1>"), "Missing ratings page h1: " + kind);
  assert.ok(html.includes("<title>" + label + " ratings · Nikola Perović</title>"), "Missing ratings page metadata: " + kind);
  if (!catalog.items.length) {
    assert.ok(html.includes("No " + (kind === "music" ? "music" : "film") + " ratings have been published yet."),
      "Empty catalog must not be presented as a populated ratings page");
    assert.ok(!html.includes("<tbody"), "Empty catalog must not show an invented rating table");
  } else {
    const body = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
    assert.ok(body, "Missing populated rating table");
    const count = (body[1].match(/<tr\b/g) ?? []).length;
    assert.equal(count, catalog.items.length, "Not all owner-provided ratings reached the public output");
    assert.ok(html.includes("out of 5 stars"), "Ratings must have an accessible numerical label");
  }
  assert.ok(!html.includes('src="https://www.googletagmanager.com/'),
    "Ratings page may not preload Google Analytics");
  console.log(kind + ": " + catalog.items.length + " genuine public ratings checked");
}
