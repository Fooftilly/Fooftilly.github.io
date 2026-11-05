/** Parse a published bookmark destination without exposing URL userinfo.
 *
 * Existing Markdown records are authoritative, including legacy records
 * outside the constraints of the new-bookmark editor. Invalid destinations
 * remain visible as bookmark titles, but never become external links.
 */
export function publicBookmarkUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname ||
        url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}
