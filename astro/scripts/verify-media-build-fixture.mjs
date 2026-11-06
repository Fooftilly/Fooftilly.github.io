/** Exercise actual Astro media loading and table rendering with temporary data.
 * CI runs this before its normal clean build. No synthetic records are committed
 * or used by manual Pages publication.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const astro = fileURLToPath(new URL("../", import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));
const source = join(root, "content", "media");
const projectSource = join(root, "content", "projects");
const bookmarkSource = join(root, "content", "bookmarks", "Resource");
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
  // Verify an entirely new project needs a Markdown entry, not route code.
  const projectFile=join(projectSource,"zz-ci-project.md");
  await writeFile(projectFile,[
    "---",
    'title: "CI-only fourth project"',
    'summary: "Disposable source-driven project route test."',
    'repository: "https://github.com/Fooftilly/PRKS"',
    "order: 999",
    'license: "AGPL-3.0-only"',
    'tags: ["CI", "Routing"]',
    "highlights:",
    '  - "Build a page from one new Markdown record"',
    "---",
    "Temporary project fixture, never for publication.",
    "",
  ].join("\n"),{flag:"wx"});
  created.push(projectFile);
  // Count the current published source records, not a fixed historical total.
  // Include future reviewed additions, but exclude draft: true records.
  let bookmarkCountBeforeFixture = 0;
  for (const section of ["Art","Fun","Music","PaperBookArticle","Perspectives","Resource","YouTube"]) {
    const folder = join(root, "content", "bookmarks", section);
    for (const filename of await readdir(folder)) {
      if (!filename.endsWith(".md") || filename === "_index.md") continue;
      const contents = await readFile(join(folder, filename), "utf8");
      const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(contents);
      assert.ok(match, "Bookmark fixture baseline has invalid frontmatter: " + filename);
      if (parse(match[1]).draft !== true) bookmarkCountBeforeFixture++;
    }
  }
  // Exercise the complete source/route/feed/release pipeline with a new
  // reviewed-shape bookmark, not only a fixture inserted into the JS selector.
  // The old timestamp prevents this fixture from changing the recent-eight UI.
  const bookmarkFile = join(bookmarkSource, "zz-ci-new-bookmark-fixture.md");
  await writeFile(bookmarkFile, [
    "---",
    'title: "CI-only new bookmark (not for publication)"',
    'date: "2000-01-01"',
    'link: "https://example.org/ci-bookmark-growth-fixture"',
    'comments: "Regression: new bookmark accepted without deleting original entries."',
    "---",
    "",
  ].join("\n"), {flag:"wx"});
  created.push(bookmarkFile);
  run("npm", ["run", "build"]);
  run("npm", ["run", "test:parity"]);
  run("npm", ["run", "test:routes"]);
  run("python3", ["scripts/verify_bookmark_feeds.py"]);
  run("node", ["scripts/verify-homepage.mjs"]);
  run("python3", ["scripts/verify-site-seo.py"]);
  run(process.execPath, ["scripts/release-readiness.mjs"]);
  const manifest = JSON.parse(await readFile(join(astro, ".audit", "bookmarks-parity.json"), "utf8"));
  assert.equal(manifest.length, bookmarkCountBeforeFixture + 1,
    "Disposable bookmark fixture must add exactly one published source record");
  assert.ok(manifest.some(row => row.id === "Resource/zz-ci-new-bookmark-fixture"),
    "New bookmark must be present in the parity manifest");
  assert.ok((await readFile(join(dist, "bookmarks", "resource", "zz-ci-new-bookmark-fixture", "index.html"), "utf8"))
    .includes("CI-only new bookmark"), "New bookmark detail page was not generated");
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
  const projectAudit=run("python3",["scripts/verify_projects.py"]);
  assert.match(projectAudit,/Verified \d+ project showcases/);
  const detail=await readFile(join(dist,"projects","zz-ci-project","index.html"),"utf8");
  const index=await readFile(join(dist,"projects","index.html"),"utf8");
  const sitemap=await readFile(join(dist,"sitemap.xml"),"utf8");
  assert.ok(detail.includes("CI-only fourth project"),"Fourth project did not render");
  assert.ok(index.includes("/projects/zz-ci-project/"),"Project missing from index");
  assert.ok(sitemap.includes("/projects/zz-ci-project/"),"Project missing from sitemap");
  const browserOutput = run(process.execPath, ["scripts/smoke-search-browser.mjs", "--media-fixtures"]);
  assert.match(browserOutput, /Media fixture Chromium smoke: Vue hydration, search, live count and sort passed/);
  console.log(browserOutput.trim());
  console.log("Actual media rendering, fourth-project routing and 577-record bookmark growth audits passed.");
} finally {
  // CI's next step rebuilds the real public artifact from source after cleanup.
  await Promise.all(created.map((path) => unlink(path)));
}
