# Astro launch and rollback runbook (pending maintainer authorization)

**Current status:** The Hugo website remains published. The Astro output is not deployed, and automatic Pages publication remains disabled.

## Preflight

1. Review merged Astro changes, security findings and CI. Verify 576 source bookmark entries, all RSS feeds, bilingual pages, SEO, navigation and browser interactions.
2. Run `cd astro && npm ci && npm test && npm run check && npm run build && node scripts/release-readiness.mjs`. Verify the generated `astro/dist/` tree, including `new-bookmark/index.html`, and save the checksum manifest from `astro/.audit/release-readiness.json`.
3. For a downloadable staging artifact, run **Astro cutover preflight (no deployment)** manually from `master` with confirmation `READ_ONLY_NO_DEPLOY`. Download the `astro-preflight-public-output` Actions artifact (retained seven days) and serve the extracted files locally, e.g. `python3 -m http.server 8000 --directory <extracted-folder>`. Only public `astro/dist/` output is included; `.audit/` is excluded. Review responsive layout and navigation without publishing anything to GitHub Pages.
4. Confirm GitHub repository setting **Pull requests → Collaborators only** remains enabled and review actual collaborator permissions. This GitHub-side setting is not checked or enforced by the Astro static build.
5. Confirm that the public bookmark composer does not contain GitHub tokens or mutation endpoints. **Any visitor can open or use the composer locally**; only authorized collaborators can propose changes through GitHub.
6. Review custom domain, TLS, CNAME, robots, sitemap, RSS and verification assets. Do not assume the DNS or hosting configuration is correct.
7. Obtain explicit maintainer approval before adding or enabling a Pages deployment workflow. Preserve the current Hugo revision and publication settings for rollback.
8. On approved cutover, deploy only `astro/dist/`; verify public and localized pages, bookmark editor, GitHub handoff, search, feeds, canonical URLs and 404 behavior.

## Rollback

If a public release fails, restore the preserved Hugo revision/publication configuration, then verify HTTPS, custom-domain ownership, sitemap and key routes. Do not bypass repository permissions to restore bookmark submission.

## Scope

- One public Astro output: `astro/dist/` hosted at `www.peroniko.xyz`.
- Public bookmark composer: `/new-bookmark/`.
- No separate admin hostname, authentication service or backend.
- Internal audit output: `astro/.audit/`, never published.
- Preflight Actions are read-only and cannot deploy; passing them does not constitute approval for release.
