import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const astroDir = fileURLToPath(new URL("../", import.meta.url));

test("browser smoke retries startup once and reports the final Chrome failure", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "astro-chrome-failure-"));
  try {
    const fakeChrome = join(fixture, "fake-chrome");
    const attempts = join(fixture, "attempts.txt");
    await writeFile(fakeChrome,
      "#!/bin/sh\nprintf 'launch\\n' >> \"$CHROME_ATTEMPT_LOG\"\nprintf '%s\\n' 'synthetic Chrome startup failure' >&2\nexit 71\n",
      { mode: 0o700 });
    const result = spawnSync(process.execPath, [
      join(astroDir, "scripts", "smoke-search-browser.mjs"),
    ], {
      cwd: astroDir,
      env: { ...process.env, CHROME_BIN: fakeChrome, CHROME_ATTEMPT_LOG: attempts },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.signal, null, "Browser test did not terminate");
    assert.equal(result.status, 1);
    assert.equal((await readFile(attempts, "utf8")).trim().split("\\n").length, 2, "Only one startup retry");
    assert.match(result.stderr, /Chromium exited before DevTools became available \(exit code 71\)/);
    assert.match(result.stderr, /synthetic Chrome startup failure/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
