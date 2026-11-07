/** Validated public labels belong to Git Markdown, not a fixed registry. */
export function validateBookmarkTags(raw: readonly string[]): string[] {
  if (raw.length > 12) throw new Error("Use at most 12 bookmark tags.");
  const seen = new Set<string>();
  return raw.map(value => {
    if (typeof value !== "string") throw new Error("Tags must be text.");
    const tag = value.trim().normalize("NFC");
    if (!tag || tag.length > 36 || /[,\u0000-\u001f\u007f]/u.test(tag)) {
      throw new Error("Tags must be printable, comma-free and at most 36 characters.");
    }
    // Locale-neutral: web clients and the Node.js build must agree (I/i).
    const key = tag.toLowerCase();
    if (seen.has(key)) throw new Error("Duplicate bookmark tag: " + tag);
    seen.add(key);
    return tag;
  });
}
/** Commas delimit editor values; content metadata is a YAML array. */
export function parseBookmarkTags(text: string): string[] {
  return text.trim() ? validateBookmarkTags(text.split(",")) : [];
}
