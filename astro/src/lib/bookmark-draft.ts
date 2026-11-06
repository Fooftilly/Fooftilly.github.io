import { BOOKMARK_CATEGORIES } from "./bookmark-categories.ts";

export interface BookmarkDraftInput {
  url: string;
  title: string;
  category: string;
  date: string;
  comments: string;
  notes: string;
}

export interface ExistingBookmarkRef {
  id: string;
  url: string;
}

export interface BookmarkDraft {
  filename: string;
  path: string;
  markdown: string;
  duplicateIds: string[];
}

/** Only public web URLs can become bookmark destinations; never embed credentials. */
export function parseBookmarkUrl(input: string): string {
  const text = input.trim();
  if (!text || text.length > 2048) throw new Error("Enter a URL of at most 2048 characters.");
  let parsed: URL;
  try { parsed = new URL(text); } catch { throw new Error("Enter a valid absolute web URL."); }
  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname)
    throw new Error("Only HTTP and HTTPS links can be bookmarked.");
  if (parsed.username || parsed.password)
    throw new Error("Remove usernames and passwords from the bookmark URL.");
  return parsed.href;
}

export function bookmarkSlug(title: string): string {
  const slug = title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
  return Array.from(slug).slice(0, 75).join("").replace(/-+$/g, "");
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(date);
}

/** Generates Markdown to be reviewed and committed by an authenticated GitHub user. */
export function composeBookmarkDraft(input: BookmarkDraftInput, existing: readonly ExistingBookmarkRef[]): BookmarkDraft {
  const category = BOOKMARK_CATEGORIES.find((item) => item.section === input.category);
  if (!category) throw new Error("Choose an existing bookmark category.");
  const title = input.title.trim();
  if (!title || title.length > 200) throw new Error("Enter a title of at most 200 characters.");
  const url = parseBookmarkUrl(input.url);
  if (!validDate(input.date)) throw new Error("Enter a real date in YYYY-MM-DD format.");
  if (input.comments.length > 1200 || input.notes.length > 5000)
    throw new Error("Comments must be under 1200 characters and notes under 5000 characters.");
  const slug = bookmarkSlug(title);
  if (!slug) throw new Error("Title must contain a letter or number.");
  const existingIds = new Set(existing.map((item) => item.id.toLowerCase()));
  let candidate = slug;
  for (let i = 2; existingIds.has((category.section + "/" + candidate).toLowerCase()); i++) {
    if (i > 999) throw new Error("Too many files with this title; choose a more specific title.");
    candidate = slug + "-" + i;
  }
  const filename = candidate + ".md";
  const path = "content/bookmarks/" + category.section + "/" + filename;
  const data = [
    "---",
    "title: " + JSON.stringify(title),
    "date: " + JSON.stringify(input.date),
    "link: " + JSON.stringify(url),
  ];
  if (input.comments.trim()) data.push("comments: " + JSON.stringify(input.comments.trim()));
  data.push("---", "");
  const markdown = data.join("\n") + (input.notes.trim() ? "\n" + input.notes.trim() + "\n" : "");
  return {
    filename,
    path,
    markdown,
    duplicateIds: existing
      .filter((item) => {
        try { return parseBookmarkUrl(item.url) === url; }
        catch { return false; }
      })
      .map((item) => item.id),
  };
}

/** Optional GitHub web-editor handoff; the browser never receives a GitHub token. */
export function githubNewFileUrl(path: string, markdown: string): string {
  if (!/^content\/bookmarks\/[A-Za-z][A-Za-z0-9]*\/[\p{L}\p{N}_-]+\.md$/u.test(path))
    throw new Error("Invalid destination filename.");
  const target = new URL("https://github.com/Fooftilly/Fooftilly.github.io/new/master");
  target.searchParams.set("filename", path);
  target.searchParams.set("value", markdown);
  return target.href;
}
