import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyRenderedCatalog } from "../scripts/verify-ratings.mjs";
import { parseRatingsCsv } from "../src/lib/ratings.ts";

const catalog = { schema: 1, kind: "music", source: "Rate Your Music", items: [
  { id: "1", title: "Rock & Roll", artist: "Artist", year: 1972, rating: 3.5, url: "https://rateyourmusic.com/release/album/example/" },
  { id: "2", title: "Second", rating: 2.5 },
] };
const row1 = '<tr><th scope="row"><a href="https://rateyourmusic.com/release/album/example/" target="_blank" rel="noopener noreferrer">Rock &amp; Roll</a></th><td>Artist</td><td>1972</td><td class="rating-value" aria-label="3.5 out of 5 stars">3.5 / 5</td></tr>';
const row2 = '<tr><th scope="row">Second</th><td>—</td><td>—</td><td class="rating-value" aria-label="2.5 out of 5 stars">2.5 / 5</td></tr>';
const page = (rows) => '<title>Music ratings · Nikola Perović</title><main><h1>Music ratings</h1><table><tbody>' + rows + '</tbody></table></main>';

test("public output audit verifies every displayed value, source link and accessible rating", () => {
  assert.doesNotThrow(() => verifyRenderedCatalog(page(row1 + row2), catalog, "music"));
  assert.throws(() => verifyRenderedCatalog(page(row2 + row1), catalog, "music"), /Rendered rating differs/);
  assert.throws(() => verifyRenderedCatalog(page(row1.replace("3.5 \/ 5", "4.0 \/ 5") + row2), catalog, "music"), /Rendered rating differs/);
  assert.throws(() => verifyRenderedCatalog(page(row1.replace("Artist</td>", "Other artist</td>") + row2), catalog, "music"), /Rendered rating differs/);
  assert.throws(() => verifyRenderedCatalog(page(row1.replace("release/album/example/", "release/album/other/") + row2), catalog, "music"), /Rendered source URL differs/);
  assert.throws(() => verifyRenderedCatalog(page(row1.replace("3.5 out of 5 stars", "4 out of 5 stars") + row2), catalog, "music"), /accessible rating label/);
  assert.throws(() => verifyRenderedCatalog(page(row1), catalog, "music"), /rows do not match/);
});

test("empty state must be truthful, not a table of example personal ratings", () => {
  const empty = { schema: 1, kind: "films", source: "Rate Your Music", items: [] };
  const html = "<title>Film ratings · Nikola Perović</title><h1>Film ratings</h1><p>No film ratings have been published yet.</p>";
  assert.doesNotThrow(() => verifyRenderedCatalog(html, empty, "films"));
  assert.throws(() => verifyRenderedCatalog(html + "<tbody><tr></tr></tbody>", empty, "films"), /invented rating table/);
});

test("large private CSV reviews are discarded, not included in the published catalog", () => {
  const longPrivateReview = "not-public-".repeat(2000);
  const csv = "RYM Album,First Name,Last Name,Title,Release_Date,Rating,Review\n1,,Example,Title,2001,9,\"" + longPrivateReview + "\"";
  const result = parseRatingsCsv(csv, "music");
  assert.equal(result.items[0].rating, 4.5);
  assert.ok(!JSON.stringify(result).includes("not-public"));
});

test("local importer refuses non-UTF-8 bytes rather than writing replacement-character titles", async () => {
  const folder = await mkdtemp(join(tmpdir(), "rym-bad-encoding-"));
  try {
    const path = join(folder, "music.csv");
    await writeFile(path, Buffer.from([0x52, 0x59, 0x4d, 0x20, 0x41, 0x6c, 0x62, 0x75, 0x6d, 0x0a, 0xe9]));
    const script = fileURLToPath(new URL("../scripts/import-ratings.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [script, "music", path], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /encoded data was not valid|utf-8|invalid.*encoding/i);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
