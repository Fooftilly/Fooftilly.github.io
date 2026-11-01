import test from "node:test";
import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const astroDir = fileURLToPath(new URL("../dist/bookmarks/", import.meta.url));
const hugoSite = process.env.LEGACY_HUGO_SITE_DIR;
if (!hugoSite) throw new Error("LEGACY_HUGO_SITE_DIR is required for the Hugo URL comparison");
const hugoDir = path.join(hugoSite, "bookmarks");

/** Collect exact output paths without modifying or normalizing URL casing. */
async function detailPaths(dir) {
  const all = [];
  for (const category of await readdir(dir)) {
    const section = path.join(dir, category);
    if (!(await stat(section)).isDirectory()) continue;
    for (const child of await readdir(section)) {
      const entry = path.join(section, child);
      if (!(await stat(entry)).isDirectory()) continue;
      for (const filename of await readdir(entry)) {
        if (filename === "index.html") {
          all.push(`/bookmarks/${category}/${child}/`);
        }
      }
    }
  }
  return all.sort();
}

test("Astro bookmark detail URLs exactly match compiled legacy Hugo URLs", async () => {
  const [legacy, astro] = await Promise.all([
    detailPaths(hugoDir),
    detailPaths(astroDir),
  ]);
  assert.ok(legacy.length > 0, "Hugo baseline has no rendered bookmark details");
  assert.equal(astro.length, 576, "Astro must render one detail page per original bookmark");
  assert.deepEqual(
    astro,
    legacy,
    "Hugo and Astro bookmark paths differ; preserve URLs or add tested redirects before cutover",
  );
  console.log(`Legacy Hugo and Astro paths identical across ${astro.length} bookmark pages`);
});
