import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative, sep } from "node:path";

const cwd = resolve(".");
const publicDir = join(cwd, "dist");
const adminDir = join(cwd, "admin-dist");
const audit = join(cwd, ".audit", "bookmarks-parity.json");
const exists = async (target) => {
  try { await stat(target); return true; }
  catch (err) { if (err.code === "ENOENT") return false; throw err; }
};
async function fileList(folder) {
  const results = [];
  async function visit(path) {
    for (const item of await readdir(path, { withFileTypes: true })) {
      const full = join(path, item.name);
      if (item.isDirectory()) await visit(full);
      else if (item.isFile()) results.push(full);
      else throw new Error("Unexpected symbolic link or special file in release output");
    }
  }
  await visit(folder);
  return results.sort();
}

const bookmarks = JSON.parse(await readFile(audit, "utf8"));
assert.equal(bookmarks.length, 576, "Source bookmark inventory changed; reassess before release");
assert.equal(new Set(bookmarks.map((b) => b.id)).size, bookmarks.length);
const publicFiles = await fileList(publicDir);
const adminFiles = await fileList(adminDir);
for (const file of [
  "index.html", "sitemap.xml", "CNAME", "robots.txt", "index.xml",
  "bookmarks/index.html", "bookmarks/index.xml",
  "sr/index.html", "sr/about/index.html", "posts/index.html", "search/index.html",
]) assert.ok(await exists(join(publicDir, file)), "Missing public release file: " + file);
assert.equal(await exists(join(publicDir, "new-bookmark")), false, "Admin form exists on public site");
assert.equal(await exists(join(publicDir, "migration-audit")), false, "Internal audit is public");
assert.equal(await exists(join(publicDir, "admin")), false, "Admin output is public");
assert.ok(await exists(join(adminDir, "index.html")), "Admin static build missing");
assert.equal(await exists(join(adminDir, "CNAME")), false, "Admin inherited public custom domain");
assert.equal(await exists(join(adminDir, "sitemap.xml")), false, "Admin should not have sitemap");
assert.equal((await readFile(join(publicDir, "CNAME"), "utf8")).trim(), "www.peroniko.xyz");
const adminHtml = await readFile(join(adminDir, "index.html"), "utf8");
assert.match(adminHtml, /noindex,nofollow,noarchive,nosnippet/);
assert.match(adminHtml, /<astro-island/);

function digest(files, root) {
  const result = createHash("sha256");
  return Promise.all(files.map(async (filename) => ({
    filename: relative(root, filename).split(sep).join("/"),
    contents: await readFile(filename),
  }))).then((items) => {
    for (const item of items) {
      result.update(item.filename + "\0");
      result.update(item.contents);
    }
    return result.digest("hex");
  });
}

const summary = {
  schema: 1,
  status: "build-validated-not-deployed",
  publicHostname: "www.peroniko.xyz",
  intendedAdminHostname: "admin.peroniko.xyz",
  publicFileCount: publicFiles.length,
  adminFileCount: adminFiles.length,
  bookmarkCount: bookmarks.length,
  publicSha256: await digest(publicFiles, publicDir),
  adminSha256: await digest(adminFiles, adminDir),
  deploymentEnabled: false,
  adminAccessVerified: false,
  ownerCutoverAccepted: false,
};
const out = join(cwd, ".audit", "release-readiness.json");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
const report = [
  "## Astro migration release preflight (no deployment)",
  "",
  "- Public static files: " + summary.publicFileCount,
  "- Separate admin static files: " + summary.adminFileCount,
  "- Bookmarks: " + summary.bookmarkCount,
  "- Public build SHA-256: `" + summary.publicSha256 + "`",
  "- Admin build SHA-256: `" + summary.adminSha256 + "`",
  "- Admin Cloudflare Access/alternate-origin verification: **NOT DONE**",
  "- Public production cutover approval: **NOT GIVEN**",
  "- Deployment: **DISABLED**",
  "",
  "Do not deploy admin files until an owner-only gateway is configured and bypass tested.",
];
console.log(report.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report.join("\n") + "\n");
}
