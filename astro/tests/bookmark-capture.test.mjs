import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { captureBookmarklet, readBookmarkCapture } from "../src/lib/bookmark-capture.ts";

test("bookmarklet captures a full URL and Unicode title in a fragment, not an HTTP query", () => {
  const current = "https://example.org/notes?q=confidential%20search&token=private#chapter-2";
  const title = "Café & research: chapter #2";
  const calls = [];
  runInNewContext(captureBookmarklet.slice("javascript:".length), {
    URL, URLSearchParams,
    location: { href: current },
    document: { title },
    window: { open: (...args) => calls.push(args) },
  });
  assert.equal(calls.length, 1);
  const [target, disposition, features] = calls[0];
  const url = new URL(target);
  assert.equal(url.origin, "https://www.peroniko.xyz");
  assert.equal(url.pathname, "/new-bookmark/");
  assert.equal(url.search, "", "Captured page data must not reach the static host request");
  assert.equal(disposition, "_blank");
  assert.equal(features, "noopener");
  assert.deepEqual(readBookmarkCapture(url.search, url.hash), {
    url: current, title, category: null,
  });
});

test("fragment capture takes precedence over legacy query prefill without losing the category", () => {
  assert.deepEqual(readBookmarkCapture(
    "?url=https%3A%2F%2Fold.example%2F&title=Old&category=Research",
    "#url=https%3A%2F%2Fnew.example%2F%3Fsecret%3D1&title=Caf%C3%A9",
  ), {
    url: "https://new.example/?secret=1",
    title: "Café",
    category: "Research",
  });
  assert.deepEqual(readBookmarkCapture("?url=https%3A%2F%2Flegacy.example%2F&title=Existing&category=Art", "#other=anchor"), {
    url: "https://legacy.example/", title: "Existing", category: "Art",
  });
  assert.deepEqual(readBookmarkCapture("", ""), { url: "", title: "", category: null });
});
