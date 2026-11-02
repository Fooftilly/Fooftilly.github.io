# Astro launch and rollback runbook (pending maintainer authorization)

**Current status:** The Hugo website remains published. The Astro output is not deployed, and automatic Pages publication remains disabled.

## Preflight

1. Review merged Astro changes, security findings and CI. Verify 576 source bookmark entries, all RSS feeds, bilingual pages, SEO, navigation and browser interactions.
2. Run `cd astro && npm ci && npm test && npm run check && npm run build && node scripts/release-readiness.mjs`. Verify the generated `astro/dist/` tree, including `new-bookmark/index.html`, and save the checksum manifest from `astro/.audit/release-readiness.json`.
3. Confirm GitHub repository setting **Pull requests → Collaborators only** remains enabled and review actual collaborator permissions. This GitHub-side setting is not checked or enforced by the Astro static build.
4. Confirm that the public bookmark composer does not contain GitHub tokens or mutation endpoints. **Any visitor can open or use the composer locally**; only authorized collaborators can propose changes through GitHub.
5. Review custom domain, TLS, CNAME, robots, sitemap, RSS and verification assets. Do not assume the DNS or hosting configuration is correct.
6. Obtain explicit maintainer approval and preserve the current Hugo revision/Pages settings for rollback. Do not merge the separate owner-gated deployment PR or set the approval variable until the site is accepted.
7. After approval and merge, set the repository Actions variable `ASTRO_CUTOVER_APPROVED` to the exact value `true`. From `master`, manually dispatch **Deploy Astro to GitHub Pages (manual approved cutover)** with confirmation `PUBLISH_ASTRO_TO_PAGES`. Both controls must match; a missing variable disables both jobs. Require review of the `github-pages` deployment environment where supported. No push, schedule or PR trigger can deploy.
8. This workflow rebuilds and revalidates the complete Astro site, then uploads only `astro/dist/` and deploys it with scoped Pages permissions. Review the resulting Actions run and deployment URL; confirm domain, TLS, sitemap, RSS, bilingual pages, browser search, 404, and GitHub editor handoff.
9. Set `ASTRO_CUTOVER_APPROVED` to `false` immediately after the approved cutover. Preserve the manual-only Hugo deployment workflow for rollback until separately authorized to retire it.

## Rollback

If a public release fails, set `ASTRO_CUTOVER_APPROVED=false`, then restore the preserved Hugo revision/publication configuration using the existing manual-only Hugo workflow or a reviewed rollback commit. Verify HTTPS, custom-domain ownership, sitemap and key routes. Do not bypass repository permissions to restore bookmark submission.

## Scope

- One public Astro output: `astro/dist/` hosted at `www.peroniko.xyz`.
- Public bookmark composer: `/new-bookmark/`.
- No separate admin hostname, authentication service or backend.
- Internal audit output: `astro/.audit/`, never published.
- The existing read-only preflight cannot deploy; passing it does not constitute approval for release.
- A separate owner-gated Pages workflow is proposed but remains in a PR until cutover approval. If approved and merged, it runs only by manual dispatch with the exact approval variable and confirmation string; it never publishes from push or PR CI.
