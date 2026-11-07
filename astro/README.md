# Astro + Vue public site

This directory implements the Astro 7, Vue 3 and TypeScript site tracked in [migration roadmap #11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11). Publication uses a separately approved, **manual-only** GitHub Pages workflow. There is no automatic Pages deployment and no compatibility promise for old Hugo paths or aliases.

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
to Pages. The old Hugo rollback workflow has been retired only after the accepted rollback window.

## Data and content

- `bookmarks` reads `../content/bookmarks/**/*.md` in place. All current public
  source records are validated for metadata parity, and static routes are
  derived deterministically from category names and file stems. Reviewed
  additions, edits, moves, renames and deletions are supported. Category
  metadata is defined once in `src/data/bookmark-categories.json` and
  must match the source category folders.
- Search, category filtering and date/title sorting share a pure TypeScript
  selector. The Vue browser supports incremental rendering and URL query state.
- Bookmark tags are optional Unicode labels defined on each Git Markdown record
  as `tags: ["Café culture", "Research"]`; tags are searchable and visible on
  listings and detail pages. The public new-bookmark editor creates the same
  validated array from comma-separated input. No fixed tag registry is needed.
- Individual bookmark pages render the current Markdown body when present;
  new, edited and existing notes are supported without a frozen source snapshot.
- The site-wide `/index.xml` RSS feed, bookmarks root feed and one feed for each
  configured category are generated from the current public bookmark collection.
  The home and posts pages advertise the site feed; CI validates every
  generated XML feed, metadata, links and record ordering.
- `sitePages` uses the original English and Serbo-Croatian (Latin) About, posts and search
  Markdown frontmatter. About content is rendered directly from Markdown;
  posts/search routes use original page titles without inventing articles.
- There are no individual published posts in `content/posts/`. CI rejects
  new post Markdown until article pages have been implemented, rather than
  silently omitting content.
- `/posts/`, `/sh/posts/`, `/search/` and `/sh/search/` are Astro routes.
  Search pages use the full bookmark collection and localized controls.

These are **Astro-owned routes**, not legacy Hugo URL promises. Compatibility
redirects and the compiled-Hugo route comparison have been removed.

## Static output and SEO

Astro copies the repository-level `static/` directory through
`publicDir`, preserving the domain configuration, icons, robots file and
other assets. Its sitemap lists only routes Astro actually generates. Shared layouts provide canonical/social metadata and
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

## First-party media collection (films, TV and music)

The website owns the media data. Each entry is a reviewed Git-managed JSON file
in `content/media/films/`, `content/media/tv/` or `content/media/music/`.
RYM, Letterboxd and other services are **optional links or import sources**;
the site works without their accounts, APIs or continued availability.
The static `/media/`, `/films/`, `/tv/` and `/music/` routes read only
these files, with no fabricated ratings. Ratings are optional (0.5–5 stars).
A record can contain a title, creator/artist, year, progress status, public
notes and up to eight external links. Collection pages display **compact,
square-edge link buttons** for source URLs that actually appear in that
record—no guessed IMDb/TMDb/Wikipedia identifiers and no search-page
substitutes. The new-media editor recognizes IMDb, TMDb, Wikipedia, BFI,
Criterion, Letterboxd, RYM, MusicBrainz, AllMusic, Discogs and Bandcamp
by hostname and uses recognizable labels; other sources retain their
explicit label. Trakt references are excluded.
Every build checks the entire catalog for
case-insensitive duplicate paths and matching media identities, including
hand-edited JSON records. Generic external references (such as an artist's
homepage) may be shared by distinct entries.

When records exist, the film, TV and music tables offer local title/creator/notes
search and rating, title or year sorting. Search is accent-insensitive. Every
record remains present in the static HTML for indexing and accessibility;
the controls are provided by a hydrated Vue island; the entire table remains
server-rendered and usable without JavaScript. The site does not send search
text or personal catalog data to any third-party service.

### Add or edit one item

Use the public `/new-media/` form. Media type and status use keyboard-accessible,
single-selected button groups rather than dropdowns. The five-star slider
accepts **half-star increments** (0.5–5); its zero position and Clear button
remove the optional rating entirely. The controls and cards use the site's
square-edge styling in both light and dark mode.

The form validates a draft, checks existing
media records for likely duplicates, previews the JSON and links to GitHub's
authenticated editor. GitHub may prefill the proposed filename and content;
**verify both before committing**. If the URL is too long, use the built-in
Copy JSON and Copy file path controls. If a matching record already exists,
use its GitHub **edit existing file** link instead of making a duplicate.
The browser cannot write to the repository, open PRs without GitHub access,
or store GitHub credentials. Collaborator-only PR permissions are enforced
by GitHub, not by the public form. After editing on a separate branch, open
a PR and wait for CI/review before merging. Production publication remains
a separate manual GitHub Actions workflow.

### Import an existing collection offline

Export music ratings from RYM, or film ratings from RYM/Letterboxd. The
current adapters support **rated entries only**; unrated/watchlist entries
can be added individually. RYM integer ratings use 0–10, normalized to
0.5–5 stars (7 → 3.5). Letterboxd ratings already use 0.5–5 stars.
Data fields are mapped into the same first-party per-item JSON schema as
the manual form; **no source-specific identifier is required**.

```sh
cd astro
# Preview only. The CSV stays local, and no files change:
node scripts/import-media.mjs music ~/Downloads/rym-music.csv rym
node scripts/import-media.mjs films ~/Downloads/rym-films.csv rym
node scripts/import-media.mjs films ~/Downloads/letterboxd-ratings.csv letterboxd

# After reviewing the preview, create NEW files only:
node scripts/import-media.mjs music ~/Downloads/rym-music.csv rym --write
# Run one importer per exported collection; imports fail on existing
# conflicting records and never overwrite public media automatically.

npm test
npm run check
npm run build
python3 scripts/verify_media.py
git status --short -- ../content/media
# New files are untracked and omitted from git diff until marked intent-to-add:
git add -N -- ../content/media
git diff -- ../content/media
```

Invalid UTF-8, unsupported CSV formats, unsafe external URLs, title/path
collisions, repeated canonical source URLs across export rows, and conflicts
with existing entries are rejected rather than silently changing data. A reimport of an **unchanged** file is idempotent;
changed ratings or enriched metadata require editing the existing entry.
Only explicitly selected public fields are stored: title, creator/year,
rating, status and permitted links. Source reviews, ownership and private
metadata are not copied. Never commit the raw exports without reviewing their
privacy implications; raw CSVs are not automatically uploaded anywhere.

CI also runs one disposable Astro build with synthetic film, TV and music JSON
records to exercise the **actual content loader, static table renderer and
source-to-HTML audit**. Those records are deleted before the next clean build;
the release candidate and the manual Pages workflow never use CI fixtures.

The owner supplied real Letterboxd and RYM exports on November 7, 2026.
Draft [PR #99](https://github.com/Fooftilly/Fooftilly.github.io/pull/99)
stages only rated film entries; conflicting ratings were individually approved,
and disputed film identities remain outside the import until verified.
Unrated RYM rows, unverified album/EP/single release types, reviews, watchlists
and diary dates are not imported. The rating model also supports optional
per-disc album track scores and independent TV/anime season and episode scores,
with explicit editors and static rendering/audit. No track or TV scores are
generated from album or series ratings.
See [MEDIA_IMPORT.md](MEDIA_IMPORT.md) for the evidence, decisions and
remaining release-type verification. The Git PR must be reviewed before merging,
and publishing still requires a separate manual GitHub Pages deployment.

## Privacy disclosure and visitor controls

The bilingual `/privacy/` and `/sh/privacy/` pages use canonical
`content/privacy.md` and `content/privacy.sh.md` Markdown, rendered through the
existing Astro `sitePages` collection. They explain GitHub Pages
hosting, the optional Google Analytics opt-in, the browser-local consent
preference, click-to-load Giscus comments, third-party destinations, and
contact via the existing About pages. The footer and cookie overlay link to
the disclosure in each language. The independent static SEO audit checks
both routes, canonical/language metadata, provider-policy links, and absence
of eager third-party tracking scripts. The manual Pages publish verifies
the new public routes after deployment.

The **Google Analytics property-level data-retention setting is not
verified** by this repository. The disclosure does not invent a retention
period or claim legal compliance. The owner still needs to verify and
document the actual setting, revisit the disclosure and third-party
service settings, and determine applicable legal requirements under #3.

### SH locale and URL changes

The English/Serbo-Croatian language switch displays **EN** and **SH**. The
Serbo-Croatian pages now use the `sh` locale, `/sh/` URL prefix and
`*.sh.md` content filenames. This deliberately removes earlier `/sr/`
routes without redirects, per the owner's explicit migration decision.
Already shared links with the old prefix will result in a 404 after manual
publication; references should be updated to `/sh/`. CI verifies the new
canonical URLs and switch labels. See `CUTOVER.md` for the release impact.

## Public project showcase

The `/projects/` index and `/projects/[slug]/` details use one static
Astro template and reviewed `content/projects/*.md` files. Frontmatter
declares a concise title, summary, public GitHub repository, display order,
SPDX license, tags, verified highlights and optional HTTPS documentation
links; body Markdown holds the short description. The schema rejects extra
fields and unsafe URLs. The filename becomes the lowercase URL slug.

Add future projects by creating one Markdown record. The page template,
sitemap and project index discover it automatically, without a server,
GitHub API calls or new database. CI verifies every entry against its
rendered static route and direct repository link. Source screenshots and complete SH project details are added only after
separate review. The project index has canonical `/projects/` and
`/sh/projects/` routes, with short manually reviewed SH summaries in optional
`summarySh` frontmatter. Technical project detail pages remain English-only.

The first records cover PRKS (work in progress), kokoro-extension and
local-search-mcp. There are no fictional demos, metrics or runtime embeds.
The separate manual Pages workflow remains required for publication.

## Release and maintenance

The production site is Astro and Vue. A maintainer explicitly approves each GitHub Pages deployment. The old Hugo build, theme submodules and templates have been retired after cutover and the rollback period. The existing `cloakemail` content shortcode is translated by a native Sätteri plugin into a `mailto:` link; it does not retain bot obfuscation. Reassess this privacy behavior with issue #3 if required. Preserve audit checks, source parity, 404 recovery behavior and all bookmark content on future releases.

No database, server or new publishing credentials are introduced here.

## Release-ready build discipline

Run `npm run build`, **not** `npx astro build`, for any deploy candidate.
The package build script fails if the generated parity manifest is invalid,
extracts it to ignored `.audit/bookmarks-parity.json` for post-build CI checks,
and removes the public `dist/migration-audit/` route. The intermediate
route also returns HTTP 404 on the development server. Tests and CI verify
both the production output and the live development server cannot expose
internal audit records. Publishing remains gated by a separate manual-only workflow.

## Browser bookmark drafts (no backend)

The `/new-bookmark/` page is a public, credential-free, static Vue composer. GitHub repository settings restrict pull-request creation to collaborators; this is a GitHub-side permission gate, not authentication for opening the form. Supply
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
into the form at `www.peroniko.xyz`. The bookmarklet
does not create a file or send the page to any other service. No GitHub
write token, OAuth client credentials or public write endpoint exist in
the browser bundle. A maintainer must review and commit the generated
Markdown (preferably on a separate branch and PR) in GitHub; until then
nothing changes on the site.

`tests/bookmark-draft.test.mjs` validates source-compatible YAML, unsafe
protocol/credential rejection, title and date checks, duplicate detection
and unique filenames. The Chromium smoke verifies real Vue hydration,
query-parameter capture, duplicate warning and safe GitHub editor handoff.
The `/new-bookmark/` and `/new-media/` routes are included in the sitemap.
Publishing remains manual-only through the existing validated GitHub Pages
workflow; merging PRs cannot deploy to production.
