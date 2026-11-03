# Astro GitHub Pages release and rollback

**Post-cutover procedure.** This document is updated by the Hugo-retirement PR and must not be used to infer that a production cutover has happened. Merge that PR only after the Astro release has been verified in production and the maintainer has approved retiring the Hugo rollback path.

## Routine manual Astro release

1. Review source changes, CI, CodeQL and outstanding security findings. Check the protected `master` branch and the current live Pages configuration.
2. Confirm expected bookmark inventory, all RSS feeds, bilingual routes, static 404, SEO, internal links, accessibility, privacy boundaries and live interactive bookmark search.
3. Run the separate read-only **Astro cutover preflight (no deployment)** on `master` with `READ_ONLY_NO_DEPLOY`. Its output does not authorize a release.
4. Obtain explicit maintainer approval for publishing. Set the repository Actions variable `ASTRO_CUTOVER_APPROVED` to `true`.
5. Dispatch **Deploy Astro to GitHub Pages (manual approved cutover)** from `master` with `PUBLISH_ASTRO_TO_PAGES`. The workflow rebuilds and audits `astro/dist/`, uploads only that directory and deploys via the `github-pages` environment.
6. Verify the final live deployment at `https://www.peroniko.xyz/`: TLS/domain, 404, sitemap/robots, English/Serbian navigation, feeds, bookmarks and GitHub draft handoff. Restore `ASTRO_CUTOVER_APPROVED=false` after the run.

No push, pull-request or schedule event publishes production; no client-side publishing token exists. The `/new-bookmark/` form is public but GitHub collaborator-only PR creation is the authorization gate.

## Rollback after Hugo retirement

Retain a tag or commit for the last known-good Astro release and its deployment metadata. If the new deployment fails, restore that commit using a reviewed rollback PR, validate the known-good build, then run the same explicit manual Astro deployment approval sequence. Re-verify the custom domain, RSS, sitemap and critical routes.

This rollback no longer depends on Hugo tooling, old theme submodules or Hugo URL compatibility. The legacy Hugo emergency workflow is removed **only after** the production Astro site has been accepted and the rollback window is closed.
