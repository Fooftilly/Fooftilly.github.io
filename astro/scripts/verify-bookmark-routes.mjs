import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
const manifestPath = fileURLToPath(new URL("../.audit/bookmarks-parity.json", import.meta.url));
const categories = new Map([
  ["Art", "art"],
  ["Fun", "fun"],
  ["Music", "music"],
  ["PaperBookArticle", "paperbookarticle"],
  ["Perspectives", "perspectives"],
  ["Resource", "resource"],
  ["YouTube", "youtube"],
]);

test("all 576 original bookmark detail URLs are generated with correct canonical URLs", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.length, 576);
  const expectedPaths = new Set();
  let notesCount = 0;

  for (const record of manifest) {
    const [section, stem, ...rest] = record.id.split("/");
    assert.equal(rest.length, 0, `Nested bookmark filename: ${record.id}`);
    const slug = categories.get(section);
    assert.ok(slug && stem, `Unrecognized content category: ${record.id}`);
    assert.match(stem, /^[\p{L}\p{N}_-]+$/u);
    const pathname = `/bookmarks/${slug}/${encodeURIComponent(stem.toLowerCase())}/`;
    assert.ok(!expectedPaths.has(pathname), `Colliding detail route: ${pathname}`);
    expectedPaths.add(pathname);

    const location = path.join(root, "bookmarks", slug, stem.toLowerCase(), "index.html");
    const html = await readFile(location, "utf8");
    assert.match(html, /class="bookmark-detail"/, `Missing detail markup: ${pathname}`);
    const canonical = new URL(pathname, "https://www.peroniko.xyz").href;
    assert.ok(html.includes(`href="${canonical}"`), `Missing canonical URL: ${pathname}`);
    assert.ok(html.includes(`href="/bookmarks/${slug}/"`), `Missing category back link: ${pathname}`);

    if (record.notesUrl) {
      notesCount++;
      assert.equal(record.notesUrl, pathname, `Invalid Notes URL: ${record.id}`);
      assert.match(html, /class="bookmark-notes"/, `Missing rendered Markdown notes: ${pathname}`);
    } else {
      assert.ok(!html.includes('class="bookmark-notes"'), `Unexpected Notes section: ${pathname}`);
    }
    if (record.url) {
      // Astro escapes query delimiters in attribute values; compare a safe
      // token to avoid coupling to HTML serializer quote/entity choices.
      const anchor = html.match(/<a\b([^>]*)>Open original link<\/a>/);
      assert.ok(anchor, `Missing original external link: ${pathname}`);
      const attr = (name) => anchor[1].match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
      const href = attr("href");
      assert.ok(href, `Missing external href: ${pathname}`);
      assert.equal(href.replaceAll("&amp;", "&"), record.url, `External URL mismatch: ${pathname}`);
      assert.equal(attr("target"), "_blank", `Unsafe external target: ${pathname}`);
      assert.deepEqual(new Set((attr("rel") ?? "").split(/\s+/)), new Set(["noopener", "noreferrer"]),
        `Unsafe external rel flags: ${pathname}`);
    }
  }

  let totalRoutes = 0;
  for (const slug of categories.values()) {
    const folder = path.join(root, "bookmarks", slug);
    for (const filename of await readdir(folder)) {
      const location = path.join(folder, filename);
      if ((await stat(location)).isDirectory()) {
        assert.ok(expectedPaths.has(`/bookmarks/${slug}/${encodeURIComponent(filename)}/`), `Unexpected detail page directory: ${location}`);
        totalRoutes++;
      }
    }
  }
  assert.equal(totalRoutes, manifest.length);
  console.log(`Validated ${totalRoutes} bookmark detail URLs; ${notesCount} rendered Markdown note pages.`);
});
