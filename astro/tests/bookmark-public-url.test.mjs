import test from "node:test";
import assert from "node:assert/strict";
import { publicBookmarkUrl } from "../src/lib/bookmark-public-url.ts";

test("valid historic HTTP(S) destinations preserve browser-normalized URLs", () => {
  assert.equal(publicBookmarkUrl("https://EXAMPLE.org:443/a?x=1#frag"),
    "https://example.org/a?x=1#frag");
  assert.equal(publicBookmarkUrl("http://example.org/a"), "http://example.org/a");
  assert.equal(publicBookmarkUrl("https://example.org/" + "x".repeat(2100)),
    "https://example.org/" + "x".repeat(2100),
    "Do not silently erase an existing legacy link merely because it exceeds the new-editor URL cap");
});

test("published links reject embedded credentials, including usernames without passwords", () => {
  for (const raw of [
    "https://user:secret@example.org/bookmark",
    "https://user@example.org/path",
    "http://%75ser:p%40ss@example.org/",
  ]) {
    assert.equal(publicBookmarkUrl(raw), "", raw);
  }
});

test("invalid, relative and non-web URL schemes cannot become clickable source links", () => {
  for (const raw of [
    "", "  ", "javascript:alert(1)", "data:text/html,<svg/>",
    "file:///etc/passwd", "ftp://example.org/", "/relative", "//example.org/",
    "https://", "not a web URL",
  ]) {
    assert.equal(publicBookmarkUrl(raw), "", raw);
  }
});

test("public URLs keep query strings but never treat them as authentication userinfo", () => {
  assert.equal(publicBookmarkUrl("https://example.org/path?user=public&ref=notes"),
    "https://example.org/path?user=public&ref=notes");
});
