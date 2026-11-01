# Astro migration staging site

This is an **unpublished** Astro 7 + Vue 3 + TypeScript implementation for the migration in [#11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11).

The current production site is still the Hugo website on `master`. Automatic Pages publishing has been disabled in #14. **Do not enable automatic Astro deployment or remove Hugo until the content, URL, i18n, RSS, SEO and accessibility acceptance gates in #11 pass.**

## Local development

Node.js 24 (or a compatible Node >=22.22.0) is required.

```sh
cd astro
npm ci
npm run check
npm test
npm run build
npm run dev
```

The dependency tree is pinned by `package-lock.json`. PR CI runs `npm ci`, tests, Astro/TypeScript validation, and a static build, but has **no deployment permissions**.

The Vue bookmark browser uses the pure `src/lib/bookmark-filter.ts` selector, covered by `tests/bookmark-filter.test.mjs`. After the staging build, CI runs `npm run test:parity`, which independently parses all 576 original Markdown frontmatter records and compares each ID, title, category, date, link destination, and comments with Astro's generated Content Collection output. The temporary `/migration-audit/bookmarks-parity.json` route exists only for this staging check. **Remove it before any public Astro cutover** rather than publishing an internal audit artifact.

## Content source

The `bookmarks` Astro Content Collection directly reads `../content/bookmarks/**/*.md` including the original frontmatter. Legacy `_index.md` section files are ignored when rendering bookmark records. No bookmark data has been migrated or modified.

The staging app now renders the root bookmark browser and all seven legacy category URLs. Static root and category RSS feeds are generated at `/bookmarks/index.xml` and `/bookmarks/<category>/index.xml`, and CI checks XML well-formedness plus source-to-feed parity for all 576 bookmarks. This resolves category and bookmark RSS behavior **in staging only**; public production remains Hugo until the broader migration passes acceptance. Bookmark detail routes are now generated from all original Markdown filenames, and Notes links appear only for entries with body content. A post-build route audit validates all detail pages and their source-derived URLs; the full source-to-output parity audit also checks Notes links against original Markdown bodies. A temporary CI baseline builds Hugo 0.147.3 and compares **all 576 compiled bookmark page paths** against Astro output; the current run confirmed exact parity, including Hugo's lowercase treatment of original mixed-case filenames. The source currently contains no nonempty bookmark Markdown bodies, so conditional Notes links render only for future entries that have body content. Broader site URL and content parity remain cutover requirements. Existing English/Serbian About pages and posts/search route shells now exist in staging. Home RSS, full-site URL/content parity, future article-detail rendering and authenticated bookmark authoring remain roadmap work.

## Publishing

The Astro build workflow performs verification only and has no `pages:write` or `id-token:write` permissions and no deploy job. Once Astro is accepted, a separate reviewed release PR will introduce the GitHub Pages deployment workflow and rollback instructions.


## Static assets and discoverability

Astro uses the existing repository-level `static/` directory directly through
`publicDir`. All original CNAME, favicons, verification files, robots.txt,
images, fonts and the web manifest are copied byte-for-byte during the build.
No duplicate asset tree is maintained.

The staging build produces `/sitemap.xml` with the routes **actually
implemented in Astro**: English and Serbian home/About/posts/search pages,
bookmark root, seven categories and 576 detail pages (592 canonical URLs).
The legacy `/en/posts/` redirect is excluded from the sitemap. Future
published article detail URLs must be added only once they are implemented.

Shared layouts now emit canonical, description, author, icon and social
metadata, with an explicit language parameter for upcoming translated routes.
`astro/scripts/verify-site-seo.py` checks all static files for byte parity,
sitemap completeness and representative metadata on generated pages.

This does **not** complete full Hugo URL, localized content, or SEO parity;
the old site remains published until all roadmap #11 acceptance gates pass.


## Bilingual About migration (staging only)

The English `/about/` and Serbian Latin `/sr/about/` pages render the
original `content/about.md` and `content/about.sr.md` Markdown through an
Astro Content Collection. The `/sr/` homepage, localized navigation and
reciprocal `hreflang` links are now generated. There is still no duplication
of the two About source documents.

The original About documents include a Hugo `cloakemail` shortcode. A
strict native Sätteri MDAST transformer maps that known shortcode to an accessible
`mailto:` link while retaining its localized label and subject. **Unlike the
original obfuscation shortcode, this exposes the already-public source email
address in generated HTML**. Restore equivalent email obfuscation or explicitly
accept the trade-off before production cutover. An unknown shortcode must
fail the build rather than appear as broken template text.

Both source documents still describe Hugo/PaperMod. Their factual references
must be refreshed when the Astro cutover is approved, without changing the
published Hugo About pages prematurely. The following posts/search slice adds the localized pages and bookmark
search. Future article rendering and broader localization still require
separate parity work.

## Posts and search route migration (staging only)

The English/Serbian `/posts/`, `/sr/posts/`, `/search/` and
`/sr/search/` routes now use the original Hugo root page frontmatter
titles from the `sitePages` Astro collection. An accessible static
`/en/posts/` redirect preserves the old Hugo archive alias and is
excluded from the generated sitemap.

There are currently no individual post Markdown entries (only
`content/posts/_index.md`), so the bilingual archive truthfully reports
an empty collection. The independent CI audit fails if individual post
Markdown files appear without a corresponding detail page implementation.

Both search pages reuse the typed Vue bookmark selector and the original
576-item Markdown collection. Search, category filtering, sorting and
URL-state controls work without a backend; the component's visible
labels and accessible region names are localized to English/Serbian.
This does **not** claim full-text indexing of posts that do not exist,
nor production parity with all Hugo search features.

All new implemented routes are included in `/sitemap.xml`, and the
new CI audit verifies source page headings, locale and alternate URLs,
rendered search data and controls, truthful empty archives, and the
legacy `/en/posts/` alias. Automatic Pages publication remains off.
