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
- The site-wide `/index.xml` RSS feed, bookmarks root feed and seven category
  feeds are generated statically from all 576 bookmarks (no published posts
  currently exist). The home and posts pages advertise the site feed; CI
  validates all 9 XML feeds, metadata, links and record ordering.
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
The source-to-Astro parity manifest is generated during `astro build`, but
`npm run build` immediately moves it to the ignored `.audit/` directory and
removes `/migration-audit/` from `dist/`. Both CI and unit tests require this
cleanup to succeed before a release-ready output is accepted. No public build
contains the internal parity endpoint.

## Remaining cutover work

- The source About Markdown still mentions Hugo/PaperMod. Refresh that content
  as part of the approved Astro publication, not as a speculative Hugo patch.
- The existing `cloakemail` shortcode is converted through a native Sätteri
  Markdown plugin. The current generated `mailto:` exposes the address instead
  of obfuscating it; restore obfuscation or explicitly accept this difference.
- Confirm final design, usability, accessibility, article publishing/editing,
  content metadata, home RSS and any planned authenticated bookmark creation.
- Remove obsolete Hugo-only runtime/build files **at cutover**, not while they
  still provide the currently published website. The public audit endpoint has
  already been eliminated from the Astro build output.
- Introduce a separately reviewed Astro deployment workflow with rollback
  instructions only after staging acceptance.

No database, server or new publishing credentials are introduced here.

## Release-ready build discipline

Run `npm run build`, **not** `npx astro build`, for any deploy candidate.
The package build script fails if the generated parity manifest is invalid,
extracts it to ignored `.audit/bookmarks-parity.json` for post-build CI checks,
and removes the public `dist/migration-audit/` route. The intermediate
route also returns HTTP 404 on the development server. Tests and CI verify
both the production output and the live development server cannot expose
internal audit records. This is a static output
hardening step; the Astro Pages deployment remains deliberately disabled.

## Browser bookmark drafts (no backend)

The `/new-bookmark/` page is a credential-free, static Vue composer. Supply
an HTTP(S) URL, title, category and optional comment/Markdown notes. It
generates YAML-compatible `content/bookmarks/<category>/<slug>.md` with a
local date, checks all existing source IDs for filename collisions, warns
when the URL already exists, and links to GitHub's authenticated new-file
editor with a filename/content prefill attempt. Copy controls provide
the **full repository-relative file path** and Markdown as a safe fallback
if GitHub ignores URL parameters or the draft exceeds safe URL length.
The GitHub prefill behavior is not part of an API contract and has not
been verified in an authenticated GitHub session; review the editor's
filename and content before committing. Oversized captured URLs/titles
are rejected rather than silently shortened.

A copyable browser bookmarklet can capture the current tab's title and URL
into the form after Astro goes live at `www.peroniko.xyz`. The bookmarklet
does not create a file or send the page to any other service. No GitHub
write token, OAuth client credentials or public write endpoint exist in
the browser bundle. A maintainer must review and commit the generated
Markdown (preferably on a separate branch and PR) in GitHub; until then
nothing changes on the site.

`tests/bookmark-draft.test.mjs` validates source-compatible YAML, unsafe
protocol/credential rejection, title and date checks, duplicate detection
and unique filenames. The Chromium smoke verifies real Vue hydration,
query-parameter capture, duplicate warning and safe GitHub editor handoff.
The `/new-bookmark/` route is included in the Astro sitemap; the site
still has no automatic deployment. A future dedicated authenticated
publishing workflow can improve one-click saving after its trust model
and user approvals are defined.
