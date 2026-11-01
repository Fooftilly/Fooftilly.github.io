import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = fileURLToPath(new URL("../../content/bookmarks/", import.meta.url));
const expected = {
  Art: 38,
  Fun: 53,
  Music: 58,
  PaperBookArticle: 20,
  Perspectives: 37,
  Resource: 54,
  YouTube: 316,
};

test("all 576 legacy bookmark records remain available without a migration rewrite", async () => {
  let total = 0;
  for (const [category, expectedCount] of Object.entries(expected)) {
    const files = (await readdir(path.join(base, category)))
      .filter((file) => file.endsWith(".md") && file !== "_index.md");
    assert.equal(files.length, expectedCount, category);
    for (const name of files) {
      const raw = await readFile(path.join(base, category, name), "utf8");
      assert.match(raw, /^---\s*\n/m, `${category}/${name}: frontmatter`);
      assert.match(raw, /^title:\s*.+$/m, `${category}/${name}: title`);
    }
    total += files.length;
  }
  assert.equal(total, 576);
});
