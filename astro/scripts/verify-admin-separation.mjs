import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const dir = resolve("admin-dist");
const publicDir = resolve("dist");
const exists = async (path) => {
  try { await stat(path); return true; }
  catch (e) { if (e.code === "ENOENT") return false; throw e; }
};

const html = await readFile(join(dir, "index.html"), "utf8");
assert.match(html, /Bookmark administration/);
assert.match(html, /noindex,nofollow,noarchive,nosnippet/);
assert.match(html, /<astro-island/);
assert.match(html, /https:\/\/www\.peroniko\.xyz\/bookmarks\//);
assert.ok(!html.includes("ghp_") && !html.includes("github_pat_"), "Possible credential in admin output");
assert.match(await readFile(join(dir, "robots.txt"), "utf8"), /Disallow: \//);

assert.equal(await exists(join(publicDir, "new-bookmark")), false, "Public admin page exposed");
assert.equal(await exists(join(publicDir, "admin")), false, "Admin subsite in public build");
assert.equal(await exists(join(publicDir, "migration-audit")), false, "Internal manifest in public build");
assert.equal(await exists(join(dir, "CNAME")), false, "Do not assign the public domain to admin output");
assert.equal(await exists(join(dir, "sitemap.xml")), false, "Private admin sitemap not permitted");
assert.equal(await exists(join(dir, "bookmarks")), false, "Public bookmarks should not be copied into admin");
assert.deepEqual((await readdir(dir)).filter(x => !["index.html", "robots.txt", "_astro"].includes(x)), [],
  "Unexpected files shipped with admin site");

const source = await readFile("src/components/NewBookmark.vue", "utf8");
const bookmarklet = source.match(/const captureBookmarklet = '([^']+)'/);
assert.ok(bookmarklet, "Bookmarklet source was not found");
const destination = bookmarklet[1].match(/new URL\("([^"]+)"\)/);
assert.ok(destination, "Bookmarklet must instantiate a fixed destination URL");
const target = new URL(destination[1]);
assert.equal(target.protocol, "https:", "Bookmarklet must use HTTPS");
assert.equal(target.hostname, "admin.peroniko.xyz", "Bookmarklet must target admin hostname");
assert.equal(target.pathname, "/", "Bookmarklet must target the root admin entrypoint");
assert.equal(target.username, "", "Bookmarklet must not contain credentials");
assert.equal(target.password, "", "Bookmarklet must not contain credentials");
console.log("Public and admin static builds isolated; no admin route, credentials, or domain crossover");
