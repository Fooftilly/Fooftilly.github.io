# Peroniko site — agent instructions

## Source of truth and current state

Read the relevant code and GitHub state before changing anything. The production site is built from `master` with Hugo + PaperMod today; the accepted target is Astro + Vue 3 + TypeScript in [migration roadmap #11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11). **Do not treat an architectural target as already implemented.** `CONTRIBUTING.md` defines the general repository workflow. Record authoritative migration acceptance and decisions in #11, not in parallel planning files.

## Product and architecture

- Preserve GitHub Pages, the custom domain `https://www.peroniko.xyz/`, Git-managed Markdown, and current publishing boundaries until the corresponding roadmap phase is verified.
- Current Hugo templates, citation overrides, and bookmark browser are transitional. Do not add long-lived Hugo-specific architecture while migrating to Astro. Coordinate pending PRs #6, #7 and #8; avoid duplicating or discarding implemented behavior.
- Astro should generate static content and SEO markup. Use Vue/TypeScript for interactive components only where needed; maintain reusable, testable state/data helpers.
- Do not introduce a backend, database, SSR service, users/authentication, remote search indexing, or a new deployment provider without a specific accepted feature need.
- Use dedicated markup/style/script files and components; never embed large HTML, CSS or JavaScript source strings inside Python or another host language.
- For future bookmark publishing, use authenticated GitHub integration or an equivalent protected service. Never put a GitHub write token in the browser bundle. Validate external links and reject unsafe schemes.

## Data integrity and compatibility

- Treat the bookmark Markdown files as user content. Before schema or framework migration, inventory and verify every published record; preserve titles, external links, dates, category, notes, and ordering semantics where used.
- Preserve published route behavior and both English/Serbian language pages; test redirects if changing URLs.
- Preserve RSS feeds, sitemap, robots, metadata, favicon, verification files, and Giscus behavior or document intentional changes.
- Do not silently change analytics or third-party privacy behavior; investigate #3 first. Keep the existing citation and feed behavior until replacement acceptance.

## Work selection, PRs and review

- Check open/closed issues, PRs and current `master` before starting; clearly distinguish verified defects from assumptions.
- Use roadmap issues for major decisions and focused implementation issues/PRs for accepted slices. Prefer cohesive PRs; fix related review findings within the original PR.
- Follow PR template: explain the motivation, architectural integration, user-visible effect, verification, tradeoffs and known limitations.
- No auto-merge, branch-rule bypass or direct `master` edits. Merge only after explicit maintainer authorization and confirmed applicable CI success.
- The approved roadmap does not authorize premature production cutover. Keep the old deployment until Astro acceptance, verification and rollback are established.
- Do not copy PRKS Project #3 assignments, backend migration mechanics or E2E sharding into this smaller repository.

## Testing and security

- Run the smallest meaningful focused tests plus the full site build on affected content/routes. Automate content parity, RSS, canonical link and representative URL checks for migration.
- Prefer unit/component tests for pure search/filter logic; use browser tests for accessibility and actual interactive workflows, not assertions covered by faster tests.
- Keep workflow permissions least-privilege; pin third-party Actions, review dependency updates and preserve CI check names needed for branch rules.
- Reproduce problems before fixing them; do not suppress lint findings, weaken tests, or claim success when a check is still running.
- See `SECURITY.md` for vulnerability reporting; never expose credentials or security details in public issues.
