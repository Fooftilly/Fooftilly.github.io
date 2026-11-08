import test from "node:test";
import assert from "node:assert/strict";
import { chromiumPageWebSocketUrl } from "../scripts/chromium-devtools-target.mjs";

const port = 49152;
const id = "8F4C3E1B-7722-45CB-B31A";
const local = `ws://127.0.0.1:${port}/devtools/page/${id}`;

test("Chrome smoke accepts only its own loopback DevTools page WebSocket", () => {
  assert.equal(chromiumPageWebSocketUrl(local, port, id), local);
  assert.throws(() => chromiumPageWebSocketUrl(local, 0, id), /port/);
  assert.throws(() => chromiumPageWebSocketUrl(local, 65536, id), /port/);
  assert.throws(() => chromiumPageWebSocketUrl(local, port, "../browser"), /target/);
  assert.throws(() => chromiumPageWebSocketUrl(undefined, port, id), /target/);
});

test("an unexpected or externally hosted WebSocket cannot receive local fixture data", () => {
  const rejected = [
    `ws://evil.example:${port}/devtools/page/${id}`,
    `wss://evil.example:${port}/devtools/page/${id}`,
    `ws://127.0.0.2:${port}/devtools/page/${id}`,
    `ws://localhost:${port}/devtools/page/${id}`,
    `ws://[::1]:${port}/devtools/page/${id}`,
    `ws://127.0.0.1:${port + 1}/devtools/page/${id}`,
    `ws://user:password@127.0.0.1:${port}/devtools/page/${id}`,
    `ws://127.0.0.1:${port}/devtools/browser/${id}`,
    `ws://127.0.0.1:${port}/devtools/page/DIFFERENT`,
    `ws://127.0.0.1:${port}/devtools/page/${id}?q=secret`,
    `ws://127.0.0.1:${port}/devtools/page/${id}#secret`,
    `ws://127.0.0.1:${port}/devtools/page/%2F${id}`,
  ];
  for (const candidate of rejected) {
    assert.throws(() => chromiumPageWebSocketUrl(candidate, port, id),
      /expected loopback page target/, candidate);
  }
});
