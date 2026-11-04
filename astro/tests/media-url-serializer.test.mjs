import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/canonicalize-media-urls.mjs", import.meta.url));
const run = (input) => spawnSync(process.execPath, [script], {
  input: JSON.stringify(input), encoding: "utf8",
});

test("media URL audit canonicalizes IDNA, IPv6 and relative dot segments", () => {
  const result = run([
    "https://faß.de/",
    "https://[2001:0db8:0000:0000:0000:0000:0000:0001]/",
    "https://example.org/reviews/%2E%2e/film",
    "https://example.org/..//film",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    "https://xn--fa-hia.de/",
    "https://[2001:db8::1]/",
    "https://example.org/film",
    "https://example.org//film",
  ]);
});

test("media URL audit rejects credential-bearing and non-HTTP URLs", () => {
  for (const url of ["javascript:alert(1)", "https://user:pass@example.org/"]) {
    const result = run([url]);
    assert.notEqual(result.status, 0, url);
    assert.match(result.stderr, /Invalid public media URL/);
  }
});

test("media URL audit validates array inputs", () => {
  const result = run({ url: "https://example.org/" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected URL array/);
});
