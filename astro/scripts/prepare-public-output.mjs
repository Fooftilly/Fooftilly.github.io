/**
 * Extract the source-to-Astro parity artifact for local CI tests, then remove
 * its public route from the actual build output. Any npm run build must produce
 * a dist/ tree which is safe to publish without a migration-audit endpoint.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function preparePublicOutput(dist, privateManifest) {
  const auditDir = join(dist, "migration-audit");
  const input = join(auditDir, "bookmarks-parity.json");
  // Do not accept missing/invalid audit output: this would silently weaken
  // record parity checks, especially on a malformed/partial Astro build.
  const bytes = await readFile(input);
  const manifest = JSON.parse(bytes.toString("utf8"));
  assert.ok(Array.isArray(manifest) && manifest.length > 0, "Invalid Astro audit manifest");
  const ids = new Set();
  for (const item of manifest) {
    assert.ok(typeof item.id === "string" && item.id.length, "Invalid bookmark identifier");
    assert.ok(!ids.has(item.id), "Duplicate bookmark identifier in audit output");
    ids.add(item.id);
  }
  await rm(privateManifest, { force: true });
  await mkdir(dirname(privateManifest), { recursive: true });
  await writeFile(privateManifest, bytes, { mode: 0o600, flag: "w" });
  await rm(auditDir, { recursive: true });
  await assert.rejects(stat(auditDir), { code: "ENOENT" });
  return manifest.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const count = await preparePublicOutput(
    join(root, "dist"),
    join(root, ".audit", "bookmarks-parity.json"),
  );
  console.log("Extracted " + count + " bookmark records for verification; removed public migration-audit route.");
}
