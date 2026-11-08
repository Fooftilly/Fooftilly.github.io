/** Keep a bookmarklet's captured page URL and title out of the editor's
 * HTTP request URL. The URL fragment is handled in the browser, never
 * transmitted to GitHub Pages/CDN as a request query string.
 */
export const captureBookmarklet =
  'javascript:(()=>{const u=new URL("https://www.peroniko.xyz/new-bookmark/");u.hash=new URLSearchParams({url:location.href,title:document.title}).toString();window.open(u.href,"_blank","noopener");})();';

export interface BookmarkCapture {
  url: string;
  title: string;
  category: string | null;
}

/** Preserve existing ?url=/ ?title= prefill links while new captures use #.
 * Category is a public, non-sensitive selector and stays query-driven.
 */
export function readBookmarkCapture(search: string, hash: string): BookmarkCapture {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  return {
    url: fragment.get("url") ?? query.get("url") ?? "",
    title: fragment.get("title") ?? query.get("title") ?? "",
    category: query.get("category"),
  };
}
