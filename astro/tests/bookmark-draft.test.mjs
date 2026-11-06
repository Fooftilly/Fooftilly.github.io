import test from "node:test";
import assert from "node:assert/strict";
import { parse } from "yaml";
import {
  composeBookmarkDraft, parseBookmarkUrl, bookmarkSlug, githubNewFileUrl,
} from "../src/lib/bookmark-draft.ts";
import { bookmarkDetailPath } from "../src/lib/bookmark-path.ts";
import { BOOKMARK_CATEGORIES, defaultBookmarkCategory } from "../src/lib/bookmark-categories.ts";
const defaultCategory = defaultBookmarkCategory();
const otherCategory = BOOKMARK_CATEGORIES.find(c => c.section !== defaultCategory.section) ?? defaultCategory;
const primary = defaultCategory.section;
const secondary = otherCategory.section;

const valid = {
  title: "Čudesni članak / reference",
  url: "https://example.org/story?x=1&y=2",
  category: primary,
  date: "2026-11-01",
  comments: "First line\nsecond line: #1",
  notes: "Personal **notes**\n\n- Useful source",
};

test("generates source-compatible YAML and optional Markdown body", () => {
  const draft = composeBookmarkDraft(valid, []);
  assert.equal(draft.path, "content/bookmarks/" + primary + "/cudesni-clanak-reference.md");
  const segments = draft.markdown.split("---");
  const frontmatter = parse(segments[1]);
  assert.deepEqual(frontmatter, {
    title: valid.title,
    date: valid.date,
    link: valid.url,
    comments: valid.comments,
  });
  assert.match(draft.markdown, /Personal \*\*notes\*\*/);
  assert.equal(draft.duplicateIds.length, 0);
});

test("same URL gets a duplicate warning and filename gets a unique suffix", () => {
  const existing = [
    { id: primary + "/cudesni-clanak-reference", url: valid.url },
    { id: primary + "/cudesni-clanak-reference-2", url: "https://example.org/another" },
  ];
  const out = composeBookmarkDraft(valid, existing);
  assert.equal(out.filename, "cudesni-clanak-reference-3.md");
  assert.deepEqual(out.duplicateIds, [primary + "/cudesni-clanak-reference"]);
});

test("safely encodes YAML-breaking quote and newline characters", () => {
  const title = "A: \"quote\"\n---\nlink: javascript:alert(1)";
  const out = composeBookmarkDraft({ ...valid, title, comments: "line\n---\ndraft: false" }, []);
  const metadata = parse(out.markdown.split("---\n")[1]);
  assert.equal(metadata.title, title);
  assert.equal(metadata.comments, "line\n---\ndraft: false");
  assert.equal(metadata.link, valid.url);
  assert.equal(out.markdown.match(/^link: /gm)?.length, 1);
});

test("only absolute HTTP(S) links without embedded credentials are accepted", () => {
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,hello", "/relative", "not a link", "https://user:pass@example.com/"]) {
    assert.throws(() => parseBookmarkUrl(url));
  }
  assert.equal(parseBookmarkUrl(" HTTPS://example.org/path#one "), "https://example.org/path#one");
});

test("invalid categories, blank titles, date rollover and oversized fields fail", () => {
  assert.throws(() => composeBookmarkDraft({ ...valid, category: "Nonexistent" }, []), /category/);
  assert.throws(() => composeBookmarkDraft({ ...valid, title: "  " }, []), /title/);
  assert.throws(() => composeBookmarkDraft({ ...valid, date: "2026-02-30" }, []), /date/);
  assert.throws(() => composeBookmarkDraft({ ...valid, comments: "a".repeat(1201) }, []), /1200/);
  assert.throws(() => composeBookmarkDraft({ ...valid, title: "#!" }, []), /letter or number/);
});

test("GitHub handoff accepts a configured-style category with digits but rejects unsafe paths", () => {
  const target = githubNewFileUrl("content/bookmarks/Web3/valid-bookmark.md", "---\\ntitle: Example\\n---\\n");
  assert.equal(new URL(target).searchParams.get("filename"), "content/bookmarks/Web3/valid-bookmark.md");
  assert.throws(() => githubNewFileUrl("content/bookmarks/../oops.md", ""), /Invalid destination/);
  assert.throws(() => githubNewFileUrl("content/bookmarks/Web3/x/invalid.md", ""), /Invalid destination/);
});

test("safe canonical path is used in GitHub new-file handoff", () => {
  const draft = composeBookmarkDraft(valid, []);
  const url = new URL(githubNewFileUrl(draft.path, draft.markdown));
  assert.equal(url.origin, "https://github.com");
  assert.equal(url.pathname, "/Fooftilly/Fooftilly.github.io/new/master");
  assert.equal(url.searchParams.get("filename"), draft.path);
  assert.equal(url.searchParams.get("value"), draft.markdown);
  assert.ok(!url.href.includes("access_token"));
  assert.throws(() => githubNewFileUrl("../.github/workflows/payload.yml", "bad"));
});

test("non-Latin filenames remain safe and stable", () => {
  const s = bookmarkSlug("Чување линкова / 2026");
  assert.equal(s, "чување-линкова-2026");
  assert.match(composeBookmarkDraft({ ...valid, title: "Чување линкова" }, []).path, /чување-линкова\.md$/);
});

test("duplicate warnings can link to canonical, existing first-party detail pages", () => {
  const existing = [
    {id:primary + "/source",url:valid.url},
    {id:secondary + "/same-source",url:valid.url},
    {id:primary + "/another",url:"https://example.org/other"},
  ];
  const draft = composeBookmarkDraft(valid, existing);
  assert.deepEqual(draft.duplicateIds,[primary + "/source",secondary + "/same-source"]);
  const targets = draft.duplicateIds.map(bookmarkDetailPath);
  assert.deepEqual(targets,[
    "/bookmarks/" + defaultCategory.slug + "/source/",
    "/bookmarks/" + otherCategory.slug + "/same-source/",
  ]);
  assert.ok(targets.every(target=>target.startsWith("/bookmarks/")&&!target.includes("..")));
  assert.throws(()=>bookmarkDetailPath("../traversal"),/Unsupported bookmark ID/);
  assert.throws(()=>bookmarkDetailPath(primary + "/file/extra"),/Unsupported bookmark ID/);
});
