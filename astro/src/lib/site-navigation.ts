/** Match canonical Astro routes to the navigation section they belong to.
 * Avoid broad string prefix matches (e.g. /new-bookmark/ is not /bookmarks/).
 */
export type NavigationSection =
  | "home" | "posts" | "bookmarks" | "media" | "projects"
  | "search" | "new-bookmark" | "about" | "privacy";

export function navigationSectionForPath(pathname: string): NavigationSection | undefined {
  if (pathname === "/" || pathname === "/sh/") return "home";
  if (/^\/(?:sh\/)?posts(?:\/|$)/.test(pathname)) return "posts";
  if (/^\/bookmarks(?:\/|$)/.test(pathname)) return "bookmarks";
  if (/^\/(?:media|films|music|tv|new-media)(?:\/|$)/.test(pathname)) return "media";
  if (/^\/(?:sh\/)?projects(?:\/|$)/.test(pathname)) return "projects";
  if (/^\/(?:sh\/)?search(?:\/|$)/.test(pathname)) return "search";
  if (pathname === "/new-bookmark/") return "new-bookmark";
  if (/^\/(?:sh\/)?about(?:\/|$)/.test(pathname)) return "about";
  if (/^\/(?:sh\/)?privacy(?:\/|$)/.test(pathname)) return "privacy";
  return undefined;
}

/** Mark the exact page or a parent section; unknown/404 pages mark nothing. */
export function currentNavigationLink(
  pathname: string,
  section: NavigationSection,
  href: string,
): "page" | "location" | undefined {
  if (navigationSectionForPath(pathname) !== section) return undefined;
  if (pathname === href) return "page";
  // A parent URL is current only for pages beneath it, not a different locale.
  if (href.endsWith("/") && pathname.startsWith(href)) return "location";
  // Films, music, TV and the media editor share the /media/ header link.
  if (section === "media" && href === "/media/"
      && /^\\/(?:films|music|tv|new-media)(?:\\/|$)/.test(pathname)) return "location";
  return undefined;
}
