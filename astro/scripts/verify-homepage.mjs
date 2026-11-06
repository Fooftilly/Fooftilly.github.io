import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";
import { assertBookmarkSourceParity } from "./bookmark-inventory.mjs";

const records = JSON.parse(await readFile(".audit/bookmarks-parity.json", "utf8"));
await assertBookmarkSourceParity(records, "Homepage bookmark source");
for (const [path, language, heading] of [
  ["dist/index.html", "en", "Categories"],
  ["dist/sh/index.html", "sh", "Kategorije"],
]) {
  const html = await readFile(path, "utf8");
  assert.ok(html.includes('lang="' + language + '"'), "Language missing: " + path);
  assert.ok(html.includes(heading), "Categories missing: " + path);
  assert.match(html, /<h1\b[^>]*>\s*Peroniko\s*<\/h1>/, "Peroniko homepage brand missing: " + path);
  assert.ok(!html.includes("Nikola Perović"), "Old personal name leaked onto homepage: " + path);
  assert.ok(!html.includes("Astro migration preview"), "Technical placeholder leaked: " + path);
  assert.ok(!html.includes("Hugo na Astro"), "Serbo-Croatian preview placeholder leaked: " + path);
  assert.ok(html.includes('href="/new-bookmark/"'), "Public bookmark composer link missing: " + path);
  assert.ok(html.includes('href="' + (language === "sh" ? "/sh/projects/" : "/projects/") + '"'),
    "Missing localized project navigation: " + path);
  const sources=new Set((await readdir("../content/projects"))
    .filter(name=>name.endsWith(".md")).map(name=>name.slice(0,-3)));
  const featured=[...html.matchAll(/href="\/projects\/([a-z0-9-]+)\/"/g)]
    .map(match=>match[1]);
  assert.equal(featured.length,Math.min(3,sources.size),
    "Homepage must show up to three featured project cards");
  assert.ok(featured.every(slug=>sources.has(slug)),
    "Featured projects must refer to existing Git-managed records");
  assert.equal(new Set(featured).size,featured.length,
    "Featured project cards must be distinct");
  if (sources.size <= 3) {
    assert.deepEqual(new Set(featured),sources,
      "When all projects fit the preview, none may be omitted");
  }
  assert.ok(html.includes(String(records.length)), "Dynamic bookmark count missing: " + path);
  for (const category of BOOKMARK_CATEGORIES) {
    assert.ok(html.includes('/bookmarks/' + category.slug + '/'),
      "Missing category " + category.slug + " on " + path);
    assert.ok(html.replaceAll("&amp;", "&").includes(language === "en" ? category.label : category.labelSh),
      "Missing category label " + category.slug + " on " + path);
  }
  const recentSection = html.match(/<section class="recent-bookmarks"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(recentSection, "Recent bookmarks section missing");
  const localSearchPath = language === "sh" ? "/sh/search/" : "/search/";
  assert.ok(recentSection[1].includes('href="' + localSearchPath + '"'),
    "Recent bookmarks search link must remain in the selected language");
  const latest = html.match(/<ul class="recent-grid"[^>]*>([\s\S]*?)<\/ul>/);
  assert.ok(latest, "Recent list missing: " + path);
  assert.equal((latest[1].match(/<li\b/g) ?? []).length, 8,
    "Homepage must show only the latest eight entries");
  // Independently check every recent row against the authoritative bookmark
  // manifest; external title links must remain unchanged after adding detail links.
  const expected = [...records].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
    || a.title.localeCompare(b.title, undefined, {sensitivity:"base"})
    || a.id.localeCompare(b.id)
  ).slice(0, 8);
  const rows = [...latest[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(m => m[1]);
  assert.equal(rows.length, expected.length, "Recent row HTML differs from the source records");
  for (const [index, row] of rows.entries()) {
    const record = expected[index];
    const details = [...row.matchAll(/<a\b[^>]*class="recent-details"[^>]*>([^<]*)<\/a>/g)];
    assert.equal(details.length, 1, "Every recent bookmark must link to one internal detail page");
    const anchor = details[0][0];
    assert.ok(anchor.includes(`href="${record.detailUrl}"`),
      `Wrong recent detail link for ${record.id}`);
    assert.ok(anchor.includes(`aria-label="${language === "sh" ? "Detalji" : "Details"}:`),
      `Missing accessible localized detail label for ${record.id}`);
    assert.equal(details[0][1].trim(), language === "sh" ? "Detalji" : "Details");
    if (record.url) {
      const external = row.match(/<a\b[^>]*target="_blank"[^>]*>/);
      assert.ok(external, `External bookmark title link disappeared: ${record.id}`);
      assert.ok(external[0].replaceAll("&amp;", "&").includes(`href="${record.url}"`),
        `Original destination changed for ${record.id}`);
    } else {
      assert.ok(row.includes("<strong>"), `Bookmark without safe source URL must keep nonlink title: ${record.id}`);
    }
  }
}
console.log(`English/Serbo-Croatian homepages: ${BOOKMARK_CATEGORIES.length} categories, ${records.length} bookmarks, eight linked recent items; no preview placeholders`);
