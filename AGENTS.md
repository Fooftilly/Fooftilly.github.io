# Peroniko repository — agent rules

## Architecture and source of truth

The live application is Astro + Vue 3 + TypeScript on GitHub Pages. Use `astro/` for site implementation; `content/` is canonical Markdown; `static/` is copied as public site assets. [Roadmap #11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11) records product and migration decisions. Do not reintroduce Hugo, compatibility routes or a parallel deployment stack.

Bookmark content is living Git-managed Markdown: reviewed additions, edits, renames, moves and deletions are permitted. Validate the current source against every generated route, feed and sitemap entry, without a historical ID/count gate. Category metadata lives exclusively in `astro/src/data/bookmark-categories.json`; adding a category requires its metadata and source folder. Preserve English and Serbian-Latin content, feeds, canonical paths, notes, and custom-domain/verification assets. New posts need a complete renderer, not silent omission.

## Security and publishing

The `/new-bookmark/` composer is a public offline draft builder; only GitHub collaborators may submit pull requests. Do not embed write credentials, add an unauthenticated mutation endpoint, or introduce a new authentication provider. Production release workflows must remain manually gated and follow approved Pages environment controls. Keep privacy decisions under issue #3; inspect embedded media and analytics before changing third-party behavior.

## Engineering workflow

Inspect live GitHub issues, PRs, branch protections and current implementation before acting. Use coherent, reviewable PRs, preserve existing tests, report CI outcomes accurately, and never merge without explicit approval. Test content integrity, translated navigation, accessibility, route links, SEO, RSS and real browser behavior where relevant.

Keep HTML, CSS and JavaScript in dedicated components/scripts, not strings embedded in Python. Prefer pure helpers and conventional Astro/Vue integration, minimal dependencies and least-privilege pinned Actions. No backend, SSR service, database, new hosting provider or PRKS-specific CI architecture is needed without an accepted requirement.
