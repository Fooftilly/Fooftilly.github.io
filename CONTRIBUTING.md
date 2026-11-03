# Contributing to Peroniko

The site uses static Astro + Vue and Git-managed Markdown, published through GitHub Pages. [Migration roadmap #11](https://github.com/Fooftilly/Fooftilly.github.io/issues/11) records architectural choices and release acceptance.

## Workflow

1. Inspect current `master`, existing PRs and issues before changing anything.
2. Open a scoped pull request; never push to `master` or bypass its branch rules.
3. Run `cd astro && npm ci && npm test && npm run check && npm run build`. Changes to site content or routes also require parity, feed, SEO, internal-link, accessibility and representative browser checks.
4. Keep Markdown `content/` as the canonical source for bookmarked URLs, titles, dates, categories, comments, notes and bilingual pages. Do not mass-rewrite records or introduce Hugo URL redirects.
5. Review CI and actionable findings; do not weaken tests or suppress errors to make checks pass. Merge only with explicit maintainer authorization.
6. Deployment is controlled separately through reviewed GitHub Actions. Never insert publishing tokens in client code; the public bookmark editor creates drafts only.

Use Astro for static markup and routing, Vue for interactive islands, and tested helpers for data transformations. Preserve custom-domain, verification, RSS, sitemap, privacy and content-license behavior. Investigate third-party embed/analytics behavior under issue #3 before changing it.

The retirement of Hugo templates and submodules occurs only **after** the Astro production release and the accepted rollback window, not simply when a release PR is opened.
