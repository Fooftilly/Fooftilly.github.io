# Contributing to Peroniko

This repository hosts the public site at `https://www.peroniko.xyz/`. Until the Astro migration in #11 is accepted and deployed, **Hugo on `master` is the production source of truth**. The roadmap is not permission to delete or replace current site behavior.

## Work process

1. Search open and closed issues/PRs for duplicates, related work and active conflicts.
2. For a large change, define scope, non-goals, dependencies and acceptance in a roadmap or implementation issue.
3. Branch from current `master` and open one cohesive PR. Avoid unnecessarily small PRs or mixing unrelated changes.
4. Include rationale, architecture/integration effect, tests run, important trade-offs and related issue links in the PR body.
5. Do not merge without passing relevant checks and explicit maintainer approval. Never force-push `master` or bypass failed checks.
6. Prefer fixing review findings in the existing PR. Remove superseded code only after its replacement is proven.

## Content and compatibility invariants

- Git-managed Markdown and the existing published URLs are canonical until an explicitly reviewed migration. Do not silently alter bookmark titles, links, dates, notes, categories, or bilingual content.
- Preserve `www.peroniko.xyz` and custom-domain configuration, redirects, canonical metadata, RSS, sitemap and robots behavior unless deliberately changed.
- Validate links using safe schemes (HTTPS/HTTP for external URLs); do not inject untrusted HTML into generated pages.
- Keep article and bookmark metadata portable, and migrations reversible.
- Treat analytics, embedded content, cookies and third-party requests as privacy-sensitive; see #3.
- Keep credentials and GitHub publishing tokens server-side or in scoped Actions secrets, never in generated client assets.
- Keep HTML/CSS/JavaScript as standalone maintainable files/components, not dynamically assembled in other languages.

## Testing and checks

- On the current Hugo site, the deployment workflow on `master` is the production source; #8 proposes PR build validation. Run Hugo builds and the relevant JavaScript tests before merging any UI change.
- After the Astro migration, use a lockfile, `npm ci`, strict TypeScript checks, content schema validation, accessible component tests, and limited browser tests for true user workflows (not redundant markup assertions).
- Changes to routes/content require representative URL, feed, sitemap and bookmark-parity regression checks.
- Workflow/config changes require workflow lint and relevant security/dependency checks.
- Report verified checks and failures honestly; do not weaken tests or suppress errors to obtain a green run.

## Ownership of current work

- [#11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11) coordinates the Astro/Vue migration and acceptance.
- [#6](https://github.com/Fooftilly/Fooftilly.github.io/pull/6) is a standalone content deletion.
- [#7](https://github.com/Fooftilly/Fooftilly.github.io/pull/7) is Hugo bookmark functionality that must be carried into Astro if superseded.
- [#8](https://github.com/Fooftilly/Fooftilly.github.io/pull/8) establishes the proposed PR build gate and Hugo dependency upgrades. Do not duplicate its workflow changes in unrelated PRs.

This site does **not** need PRKS-specific Project #3 agent-queue publishing, PostgreSQL migration machinery, or six-shard browser tests.
