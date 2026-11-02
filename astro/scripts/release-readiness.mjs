import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative, sep } from "node:path";

const cwd = resolve(".");
const publicDir = join(cwd, "dist");
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
for (const file of [
  "index.html", "sitemap.xml", "CNAME", "robots.txt", "index.xml",
  "bookmarks/index.html", "bookmarks/index.xml",
  "sr/index.html", "sr/about/index.html", "posts/index.html", "search/index.html",
  "new-bookmark/index.html",
]) assert.ok(await exists(join(publicDir, file)), "Missing public release file: " + file);
assert.equal(await exists(join(publicDir, "migration-audit")), false, "Internal audit is public");
assert.equal(await exists(join(publicDir, "admin")), false, "Admin output is public");
assert.match(await readFile(join(publicDir, "new-bookmark", "index.html"), "utf8"), /<astro-island/);

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
  publicFileCount: publicFiles.length,
  bookmarkCount: bookmarks.length,
  publicSha256: await digest(publicFiles, publicDir),
  deploymentEnabled: false,
  ownerCutoverAccepted: false,
};
const out = join(cwd, ".audit", "release-readiness.json");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
const report = [
  "## Astro migration release preflight (no deployment)",
  "",
  "- Public static files: " + summary.publicFileCount,
  "- Bookmarks: " + summary.bookmarkCount,
  "- Public build SHA-256: `" + summary.publicSha256 + "`",
  "- Public bookmark composer route: **PRESENT**",
  "- GitHub collaborator-only PR restriction: **OWNER-CONFIGURED; NOT VERIFIED BY THIS BUILD**",
  "- Public production cutover approval: **NOT GIVEN**",
  "- Deployment: **DISABLED**",
  "",
  "The public composer has no write credentials. Validate collaborator-only PR settings separately before cutover.",
];
console.log(report.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report.join("\n") + "\n");
}
