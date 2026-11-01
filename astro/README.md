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

The staging app now renders the root bookmark browser and all seven legacy category URLs. Static root and category RSS feeds are generated at `/bookmarks/index.xml` and `/bookmarks/<category>/index.xml`, and CI checks XML well-formedness plus source-to-feed parity for all 576 bookmarks. This resolves category and bookmark RSS behavior **in staging only**; public production remains Hugo until the broader migration passes acceptance. Bookmark detail routes are now generated from all original Markdown filenames, and Notes links appear only for entries with body content. A post-build route audit validates all detail pages and their source-derived URLs; the full source-to-output parity audit also checks Notes links against original Markdown bodies. A temporary CI baseline builds Hugo 0.147.3 and compares **all 576 compiled bookmark page paths** against Astro output; the current run confirmed exact parity, including Hugo's lowercase treatment of original mixed-case filenames. The source currently contains no nonempty bookmark Markdown bodies, so conditional Notes links render only for future entries that have body content. Broader site URL and content parity remain cutover requirements. Bilingual routes, home RSS, full SEO/sitemap parity, article migration and authenticated bookmark authoring remain roadmap work.

## Publishing

The Astro build workflow performs verification only and has no `pages:write` or `id-token:write` permissions and no deploy job. Once Astro is accepted, a separate reviewed release PR will introduce the GitHub Pages deployment workflow and rollback instructions.


## Static assets and discoverability

Astro uses the existing repository-level `static/` directory directly through
`publicDir`. All original CNAME, favicons, verification files, robots.txt,
images, fonts and the web manifest are copied byte-for-byte during the build.
No duplicate asset tree is maintained.

The staging build produces `/sitemap.xml` with the routes **actually
implemented in Astro**: homepage, About placeholder, bookmark root, seven
categories and 576 detail pages. Future English/Serbian posts and search pages
must be added to the shared site index when their routes are implemented.
The sitemap does not claim these future pages exist.

Shared layouts now emit canonical, description, author, icon and social
metadata, with an explicit language parameter for upcoming translated routes.
`astro/scripts/verify-site-seo.py` checks all static files for byte parity,
sitemap completeness and representative metadata on generated pages.

This does **not** complete full Hugo URL, localized content, or SEO parity;
the old site remains published until all roadmap #11 acceptance gates pass.
