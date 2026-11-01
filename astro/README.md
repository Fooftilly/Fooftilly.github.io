# Astro + Vue staging application

This directory contains the unpublished Astro 7, Vue 3 and TypeScript implementation
tracked in [migration roadmap #11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11).

The existing Hugo website remains publicly hosted until the new Astro site is
accepted. Automatic GitHub Pages publishing is disabled. **The Astro site does not
promise backward compatibility with Hugo pages, permalinks or aliases.** Do not
restore Hugo comparison tests, redirects or a parallel Hugo build dependency.

## Local development

Requires Node.js >=22.22.0 (CI uses Node 24).

```sh
cd astro
npm ci
npm test
npm run check
npm run build
npm run dev
```

The lockfile is committed. CI runs read-only build validation and cannot deploy
to Pages. The old Hugo workflow remains manual-only for the still-published site.

## Data and content

- `bookmarks` reads `../content/bookmarks/**/*.md` in place. All 576 public
  source records are validated for metadata parity, and static routes are
  derived deterministically from category names and file stems.
- Search, category filtering and date/title sorting share a pure TypeScript
  selector. The Vue browser supports incremental rendering and URL query state.
- Individual bookmark pages render source Markdown body when present; source
  records currently contain no nonempty body notes.
- Seven category pages and root/category RSS feeds are generated statically.
  CI checks XML, metadata, links and all 576 feed items.
- `sitePages` uses the original English and Serbian-Latin About, posts and search
  Markdown frontmatter. About content is rendered directly from Markdown;
  posts/search routes use original page titles without inventing articles.
- There are no individual published posts in `content/posts/`. CI rejects
  new post Markdown until article pages have been implemented, rather than
  silently omitting content.
- `/posts/`, `/sr/posts/`, `/search/` and `/sr/search/` are Astro routes.
  Search pages use the full bookmark collection and localized controls.

These are **Astro-owned routes**, not legacy Hugo URL promises. Compatibility
redirects and the compiled-Hugo route comparison have been removed.

## Static output and SEO

Astro copies the existing repository-level `static/` directory through
`publicDir`, preserving the domain configuration, icons, robots file and
other assets. Its sitemap lists only routes Astro actually generates (currently
592 canonical URLs). Shared layouts provide canonical/social metadata and
language alternates.

`scripts/verify-bookmark-parity.mjs`, `verify-bookmark-routes.mjs`,
`verify_bookmark_feeds.py`, `verify-posts-search.py`,
`verify-localized-about.py` and `verify-site-seo.py` validate the new
rendered output against the original Markdown and relevant static assets.
The `/migration-audit/bookmarks-parity.json` endpoint exists solely for
staging checks and **must be removed from publicly deployed output**.

## Remaining cutover work

- The source About Markdown still mentions Hugo/PaperMod. Refresh that content
  as part of the approved Astro publication, not as a speculative Hugo patch.
- The existing `cloakemail` shortcode is converted through a native Sätteri
  Markdown plugin. The current generated `mailto:` exposes the address instead
  of obfuscating it; restore obfuscation or explicitly accept this difference.
- Confirm final design, usability, accessibility, article publishing/editing,
  content metadata, home RSS and any planned authenticated bookmark creation.
- Remove temporary audit output and obsolete Hugo-only runtime/build files
  **at cutover**, not while they still provide the existing published website.
- Introduce a separately reviewed Astro deployment workflow with rollback
  instructions only after staging acceptance.

No database, server or new publishing credentials are introduced here.
