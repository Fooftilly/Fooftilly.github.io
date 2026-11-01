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

The staging app now renders the root bookmark browser and all seven legacy category URLs. Static root and category RSS feeds are generated at `/bookmarks/index.xml` and `/bookmarks/<category>/index.xml`, and CI checks XML well-formedness plus source-to-feed parity for all 576 bookmarks. This resolves category and bookmark RSS behavior **in staging only**; public production remains Hugo until the broader migration passes acceptance. Bookmark detail routes are now generated from all original Markdown filenames, and Notes links appear only for entries with body content. A post-build route audit validates all detail pages and their source-derived URLs; the full source-to-output parity audit also checks Notes links against original Markdown bodies. **Exact compiled Hugo URL parity has not yet been independently compared**, and remains a cutover requirement. Bilingual routes, home RSS, full SEO/sitemap parity, article migration and authenticated bookmark authoring remain roadmap work.

## Publishing

The Astro build workflow performs verification only and has no `pages:write` or `id-token:write` permissions and no deploy job. Once Astro is accepted, a separate reviewed release PR will introduce the GitHub Pages deployment workflow and rollback instructions.
