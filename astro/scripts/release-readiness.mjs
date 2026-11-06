import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve, relative, sep } from "node:path";
import { assertLegacyBookmarkInventory } from "./bookmark-inventory.mjs";

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
assertLegacyBookmarkInventory(bookmarks, "Release candidate bookmarks");
const publicFiles = await fileList(publicDir);
for (const file of [
  "index.html", "404.html", "sitemap.xml", "CNAME", "robots.txt", "index.xml",
  "bookmarks/index.html", "bookmarks/index.xml",
  "sh/index.html", "sh/about/index.html", "posts/index.html", "search/index.html",
  "new-bookmark/index.html", "media/index.html", "music/index.html", "films/index.html", "tv/index.html", "new-media/index.html",
  "privacy/index.html", "sh/privacy/index.html",
  "projects/index.html", "sh/projects/index.html", "projects/prks/index.html",
  "projects/kokoro-extension/index.html", "projects/local-search-mcp/index.html",
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

// This report runs both in read-only CI and immediately before a manually
// approved publish. It records the intended operation, not a deployed status.
const releaseIntent = process.env.ASTRO_RELEASE_INTENT || "validate-only";
assert.ok(["validate-only", "publish"].includes(releaseIntent), "Invalid release intent");
if (releaseIntent === "publish") {
  const revision = (await readFile(join(publicDir, "deploy-revision.txt"), "utf8")).trim();
  assert.match(revision, /^[0-9a-f]{40}$/, "Invalid public deployment revision");
  assert.equal(revision, process.env.GITHUB_SHA, "Published revision differs from workflow SHA");
}
const summary = {
  schema: 2,
  status: "build-validated-not-deployed",
  releaseIntent,
  publicHostname: "www.peroniko.xyz",
  publicFileCount: publicFiles.length,
  bookmarkCount: bookmarks.length,
  publicSha256: await digest(publicFiles, publicDir),
};
const out = join(cwd, ".audit", "release-readiness.json");
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(summary, null, 2) + "\n", { mode: 0o600 });
const report = [
  "## Astro static release validation",
  "",
  "- Operation: **" + (releaseIntent === "publish" ? "MANUAL PUBLICATION REQUESTED" : "READ-ONLY VALIDATION") + "**",
  "- Public static files: " + summary.publicFileCount,
  "- Bookmarks: " + summary.bookmarkCount,
  "- Public build SHA-256: `" + summary.publicSha256 + "`",
  "- Public bookmark composer route: **PRESENT**",
  "- GitHub collaborator-only PR restriction: **OWNER-CONFIGURED; NOT VERIFIED BY THIS BUILD**",
  "- Deployment at this step: **" + (releaseIntent === "publish" ? "PENDING (validate, upload and verify live site next)" : "NOT REQUESTED") + "**",
  "",
  "This validates the static artifact only. A successful Pages deployment and live revision verification must be checked separately.",
];
console.log(report.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report.join("\n") + "\n");
}
