import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const baseline = JSON.parse(await readFile(
  new URL("../tests/fixtures/legacy-bookmark-ids.json", import.meta.url), "utf8",
));
assert.equal(baseline.length, 576, "Original bookmark baseline must remain complete");
assert.equal(new Set(baseline).size, baseline.length, "Original bookmark baseline contains duplicates");

/** Preserve every original legacy bookmark, while allowing reviewed new entries.
 * Compare identities, not only a count: deleting an original and adding a new
 * record must not silently pass the migration safety gate.
 */
export function assertLegacyBookmarkInventory(records, label = "Bookmark inventory") {
  const ids = records.map(record => typeof record === "string" ? record : record.id);
  const seen = new Set(ids);
  assert.equal(seen.size, ids.length, label + ": duplicate bookmark IDs");
  const missing = baseline.filter(id => !seen.has(id));
  assert.deepEqual(missing, [], label + ": original bookmark IDs were removed");
  assert.ok(ids.length >= baseline.length, label + ": bookmark count fell below original baseline");
  return ids.length;
}
