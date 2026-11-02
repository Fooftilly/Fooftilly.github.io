import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const astroDir = fileURLToPath(new URL("../", import.meta.url));

test("browser smoke reports Chrome exit status and stderr when startup fails", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "astro-chrome-failure-"));
  try {
    const fakeChrome = join(fixture, "fake-chrome");
    await writeFile(fakeChrome,
      "#!/bin/sh\nprintf '%s\\n' 'synthetic Chrome startup failure' >&2\nexit 71\n",
      { mode: 0o700 });
    const result = spawnSync(process.execPath, [
      join(astroDir, "scripts", "smoke-search-browser.mjs"),
    ], {
      cwd: astroDir,
      env: { ...process.env, CHROME_BIN: fakeChrome },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.signal, null, "Browser test did not terminate");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Chromium exited before DevTools became available \(exit code 71\)/);
    assert.match(result.stderr, /synthetic Chrome startup failure/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
