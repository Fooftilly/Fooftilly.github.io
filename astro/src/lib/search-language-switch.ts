/** Preserve bookmark filters (and only filters) when changing search language. */
const SEARCH_FILTER_KEYS = ["q", "category", "sort", "tag"] as const;
const PROJECT_QUERY_KEYS = ["q", "tag"] as const;

export function searchLanguageSwitchHref(currentHref: string, alternateHref: string): string {
  const current = new URL(currentHref);
  const alternate = new URL(alternateHref, current);
  const keys = current.pathname === "/projects/" || current.pathname === "/sh/projects/"
    ? PROJECT_QUERY_KEYS : SEARCH_FILTER_KEYS;
  for (const key of keys) {
    alternate.searchParams.delete(key);
    const value = current.searchParams.get(key);
    if (value) alternate.searchParams.set(key, value);
  }
  return alternate.pathname + alternate.search + alternate.hash;
}

/** The content pages have a static alternate; the browser query is dynamic. */
export function wireSearchLanguageSwitch(): void {
  const link = document.querySelector<HTMLAnchorElement>("a[data-search-language-switch]");
  if (!link) return;
  const baseHref = link.getAttribute("href");
  if (!baseHref) return;
  const refresh = () => {
    link.setAttribute("href", searchLanguageSwitchHref(window.location.href, baseHref));
  };
  // Initial deep links, normal click, middle-click, and context-menu new-tab.
  refresh();
  link.addEventListener("click", refresh);
  link.addEventListener("auxclick", refresh);
  link.addEventListener("contextmenu", refresh);
  link.addEventListener("focus", refresh);
  window.addEventListener("peroniko:search-state-change", refresh);
  window.addEventListener("popstate", refresh);
  window.addEventListener("pageshow", refresh);
}
