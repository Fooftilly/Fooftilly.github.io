/** Exercise actual Astro media loading and table rendering with temporary data.
 * CI runs this before its normal clean build. No synthetic records are committed
 * or used by manual Pages publication.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const astro = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = join(root, "content", "media");
const dist = join(astro, "dist");

const fixtures = [
  {
    folder: "films",
    record: {
      schema: 1, kind: "films", title: "CI synthetic film (not for publication)",
      creator: "Émilie", year: 2001.0, rating: 4.5, status: "finished",
      notes: "Synthetic note.\nSecond paragraph.",
      links: [
        { label: " First ", url: "https://faß.de/" },
        { label: " Second ", url: "https://example.org/reviews/%2e%2e/film" },
        { label: "Jazz reviews", url: "https://example.org/jazz" },
      ],
    },
  },
  {
    folder: "films",
    record: {
      schema: 1, kind: "films", title: "Zebra CI synthetic film",
      year: 2024, rating: 1.5, status: "planned",
      links: [{ label: "Source", url: "https://example.org/zebra-film" }],
    },
  },
  {
    folder: "music",
    record: {
      schema: 1, kind: "music", title: "CI synthetic album (not for publication)",
      creator: "Café", year: 2020, rating: 3.5, status: "finished",
      links: [{ label: "Music source", url: "https://example.org/album" }],
    },
  },
  {
    folder: "tv",
    record: {
      schema: 1, kind: "tv", title: "CI synthetic TV show (not for publication)",
      status: "planned",
    },
  },
];

const created = [];
function run(file, args) {
  const result = spawnSync(file, args, {
    cwd: astro, encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `${file} ${args.join(" ")} failed: ${result.error || "exit " + result.status}\n` +
      (result.stdout || "") + "\n" + (result.stderr || "")
    );
  }
  return result.stdout;
}

try {
  for (const [index, {folder, record}] of fixtures.entries()) {
    const path = join(source, folder, "zz-ci-synthetic-media-fixture-" + index + ".json");
    // Exclusive creation: never overwrite or accidentally delete a real entry.
    await writeFile(path, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
    created.push(path);
  }
  run("npm", ["run", "build"]);
  const audit = run("python3", ["scripts/verify_media.py"]);
  for (const {folder, record} of fixtures) {
    const html = await readFile(join(dist, folder, "index.html"), "utf8");
    assert.ok(html.includes(record.title), "Astro omitted synthetic " + folder + " record");
    assert.ok(html.includes("data-media-row"), "Media table lost static source rows: " + folder);
    assert.ok(html.includes("data-media-controls"), "Media search/sort controls were not rendered: " + folder);
  }
  assert.match(audit, /Verified \d+ independent media records/);
  // Run the real browser against the fixture build, then delete every fixture.
  // The existing clean build/browser gate still runs afterward.
  run(process.execPath, ["scripts/smoke-search-browser.mjs", "--media-fixtures"]);
  console.log("Actual Astro rendering and source-to-output audit passed for film, TV and music fixtures.");
} finally {
  // CI's next step rebuilds the real public artifact from source after cleanup.
  await Promise.all(created.map((path) => unlink(path)));
}
