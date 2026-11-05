import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

const records = JSON.parse(await readFile(".audit/bookmarks-parity.json", "utf8"));
assert.equal(records.length, 576);
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
  assert.ok(html.includes('href="/projects/"'), "Missing project navigation: " + path);
  const sources=new Set((await readdir("../content/projects"))
    .filter(name=>name.endsWith(".md")).map(name=>name.slice(0,-3)));
  const featured=[...html.matchAll(/href="\/projects\/([a-z0-9-]+)\/"/g)]
    .map(match=>match[1]);
  assert.equal(featured.length,Math.min(3,sources.size),
    "Homepage must show up to three featured project cards");
  assert.ok(featured.every(slug=>sources.has(slug)),
    "Featured projects must refer to existing Git-managed records");
  assert.ok(html.includes("576"), "Bookmark count missing: " + path);
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
}
console.log("English/Serbo-Croatian homepages: seven categories, 576 bookmarks, eight recent items; no preview placeholders");
