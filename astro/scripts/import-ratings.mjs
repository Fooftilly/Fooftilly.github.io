/** Offline owner-only CSV importer. Import files stay local and are never
 * uploaded to the site. Review the generated public JSON before committing.
 *
 * node scripts/import-ratings.mjs music /path/to/rym-music.csv
 * node scripts/import-ratings.mjs films /path/to/rym-films.csv
 * node scripts/import-ratings.mjs films /path/to/ratings.csv letterboxd
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRatingsCsv } from "../src/lib/ratings.ts";

const [kind, path, source = "rym", ...extra] = process.argv.slice(2);
if (extra.length || !["music", "films"].includes(kind) || !path ||
    !["rym", "letterboxd"].includes(source)) {
  console.error("Usage: node scripts/import-ratings.mjs music|films /path/to/export.csv [rym|letterboxd]");
  process.exitCode = 2;
} else {
  const input = resolve(path);
  const data = await readFile(input);
  if (data.length > 15_000_000) throw new Error("CSV file exceeds 15 MB safety limit");
  // Buffer.toString silently replaces invalid UTF-8 with U+FFFD, corrupting titles.
  // Reject non-UTF-8 exports rather than publishing altered names.
  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
  const catalog = parseRatingsCsv(text, kind, source);
  const dest = fileURLToPath(new URL("../src/data/" + kind + "-ratings.json", import.meta.url));
  await writeFile(dest, JSON.stringify(catalog, null, 2) + "\n", { encoding: "utf8" });
  console.log("Imported " + catalog.items.length + " rated " + kind + " items.");
  console.log("Review public data in " + dest + " and commit only if every item is intended to be public.");
  console.log("Input CSV, private reviews and ownership metadata were not copied.");
}
