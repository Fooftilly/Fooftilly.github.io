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

## Content source

The `bookmarks` Astro Content Collection directly reads `../content/bookmarks/**/*.md` including the original frontmatter. Legacy `_index.md` section files are ignored when rendering bookmark records. No bookmark data has been migrated or modified.

This first slice implements the home shell and a Vue interactive bookmark index as an architectural and content-loading pilot. Category-specific URLs, individual note pages, bilingual routes, full feed/SEO parity, article migration and authenticated bookmark authoring are **remaining roadmap work**, not silently dropped features.

## Publishing

The Astro build workflow performs verification only and has no `pages:write` or `id-token:write` permissions and no deploy job. Once Astro is accepted, a separate reviewed release PR will introduce the GitHub Pages deployment workflow and rollback instructions.
