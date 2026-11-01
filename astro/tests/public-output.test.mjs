import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preparePublicOutput } from "../scripts/prepare-public-output.mjs";

test("audit manifest is available privately but never left in the site build", async () => {
  const temp = await mkdtemp(join(tmpdir(), "astro-public-output-"));
  try {
    const dist = join(temp, "dist");
    const audit = join(dist, "migration-audit");
    const privateManifest = join(temp, ".audit", "bookmarks-parity.json");
    await mkdir(audit, { recursive: true });
    const source = JSON.stringify([{ id: "Art/one", title: "Example" }]);
    await writeFile(join(audit, "bookmarks-parity.json"), source);
    assert.equal(await preparePublicOutput(dist, privateManifest), 1);
    assert.equal(await readFile(privateManifest, "utf8"), source);
    await assert.rejects(stat(audit), { code: "ENOENT" });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
test("invalid manifests fail closed instead of publishing an audit directory", async () => {
  const temp = await mkdtemp(join(tmpdir(), "astro-public-output-invalid-"));
  try {
    const dist = join(temp, "dist");
    const audit = join(dist, "migration-audit");
    const privateManifest = join(temp, ".audit", "bookmarks-parity.json");
    await mkdir(audit, { recursive: true });
    await writeFile(join(audit, "bookmarks-parity.json"), JSON.stringify([{ id: "Art/a" }, { id: "Art/a" }]));
    await assert.rejects(preparePublicOutput(dist, privateManifest), /Duplicate bookmark identifier/);
    assert.equal((await stat(audit)).isDirectory(), true);
    await assert.rejects(stat(privateManifest), { code: "ENOENT" });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
