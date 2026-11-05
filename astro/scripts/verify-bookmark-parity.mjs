import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const source = fileURLToPath(new URL("../../content/bookmarks/", import.meta.url));
const manifest = fileURLToPath(new URL("../.audit/bookmarks-parity.json", import.meta.url));

const categories = {
  Art: "Art",
  Fun: "Fun",
  Music: "Music",
  PaperBookArticle: "Articles & books",
  Perspectives: "Perspectives",
  Resource: "Resources",
  YouTube: "YouTube",
};

function parseFrontmatter(raw, filename) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  assert.ok(match, `Missing YAML frontmatter: ${filename}`);
  const parsed = parse(match[1]);
  assert.equal(typeof parsed.title, "string", `Missing title: ${filename}`);
  return parsed;
}

function asDate(raw, filename) {
  if (raw === null || raw === undefined || raw === "") return "";
  const d = new Date(raw);
  assert.ok(!Number.isNaN(d.valueOf()), `Invalid source date: ${filename}`);
  return d.toISOString().slice(0, 10);
}

function safeLink(raw) {
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol)
      && parsed.hostname && !parsed.username && !parsed.password ? parsed.href : "";
  } catch {
    return "";
  }
}

test("all source bookmark metadata survives Astro collection loading and output", async () => {
  const output = JSON.parse(await readFile(manifest, "utf8"));
  assert.ok(Array.isArray(output), "Expected Astro-generated collection JSON");
  const actual = new Map();
  for (const row of output) {
    assert.equal(typeof row.id, "string");
    assert.ok(!actual.has(row.id), `Duplicate generated ID: ${row.id}`);
    actual.set(row.id, row);
  }

  const expected = new Map();
  for (const [section, category] of Object.entries(categories)) {
    const files = (await readdir(path.join(source, section))).filter(
      filename => filename.endsWith(".md") && filename !== "_index.md"
    );
    for (const filename of files) {
      const raw = await readFile(path.join(source, section, filename), "utf8");
      const frontmatter = parseFrontmatter(raw, `${section}/${filename}`);
      const sourceBody = raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "").trim();
      if (frontmatter.draft === true) continue;
      const id = `${section}/${filename.slice(0, -3)}`;
      const rawLink = frontmatter.link ?? "";
      const detailUrl = `/bookmarks/${section.toLowerCase()}/${encodeURIComponent(filename.slice(0, -3).toLowerCase())}/`;
      const normalized = {
        id,
        title: frontmatter.title,
        category,
        date: asDate(frontmatter.date, id),
        rawLink,
        url: safeLink(rawLink),
        detailUrl,
        comments: frontmatter.comments ?? "",
        notesUrl: sourceBody ? detailUrl : "",
      };
      assert.ok(!expected.has(id), `Duplicate source ID: ${id}`);
      expected.set(id, normalized);
    }
  }

  assert.equal(expected.size, 576, "Legacy 576-record baseline should not silently change");
  assert.equal(actual.size, expected.size, "Astro output must contain every source record");
  for (const [id, row] of expected) {
    assert.deepEqual(actual.get(id), row, `Source-to-output mismatch for ${id}`);
  }
  for (const id of actual.keys()) {
    assert.ok(expected.has(id), `Unexpected generated entry: ${id}`);
  }
});
