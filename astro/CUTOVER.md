# Astro Pages release and rollback runbook

**Trial cutover authorized by the maintainer.** This guide describes the release workflow; the presence of the workflow alone does not prove that a Pages deployment ran or succeeded.

## Preflight

1. Review merged Astro changes, security findings and CI. Verify 576 source bookmark entries, all RSS feeds, bilingual pages, SEO, navigation and browser interactions.
2. Run `cd astro && npm ci && npm test && npm run check && npm run build && node scripts/release-readiness.mjs`. Verify the generated `astro/dist/` tree, including `new-bookmark/index.html`, and save the checksum manifest from `astro/.audit/release-readiness.json`.
3. For a downloadable staging artifact, run **Astro cutover preflight (no deployment)** manually from `master` with confirmation `READ_ONLY_NO_DEPLOY`. Download the `astro-preflight-public-output` Actions artifact (retained seven days) and serve the extracted files locally, e.g. `python3 -m http.server 8000 --directory <extracted-folder>`. Only public `astro/dist/` output is included; `.audit/` is excluded. Review responsive layout and navigation without publishing anything to GitHub Pages.
4. Confirm GitHub repository setting **Pull requests → Collaborators only** remains enabled and review actual collaborator permissions. This GitHub-side setting is not checked or enforced by the Astro static build.
5. Confirm that the public bookmark composer does not contain GitHub tokens or mutation endpoints. **Any visitor can open or use the composer locally**; only authorized collaborators can propose changes through GitHub.
6. Review custom domain, TLS, CNAME, robots, sitemap, RSS and verification assets. Do not assume the DNS or hosting configuration is correct.
7. For the **first approved trial**, merging PR #38 on `master` with the exact squash commit title `Deploy Astro Pages approved launch PR38` triggers a **single** production build and deployment. No repository Actions variable is required for that one-time release. Review the Actions run; a green PR check does not mean deployment succeeded.
8. Normal later releases are manual: set repository Actions variable `ASTRO_CUTOVER_APPROVED=true`, then dispatch **Deploy Astro to GitHub Pages (manual approved cutover)** from `master` with `PUBLISH_ASTRO_TO_PAGES`. Set the variable back to `false` afterward. The `github-pages` environment and GitHub Pages publishing source must permit Actions deployments.
9. Verify that the live site responds correctly at `https://www.peroniko.xyz/`: TLS, homepages, `/new-bookmark/`, 404, browser search, bilingual content, RSS, sitemap, canonical URLs and GitHub draft handoff.
10. Merge the Hugo-removal PR #39 after the trial (as separately authorized); its changes must also remove the narrow one-shot push trigger, keeping the deployment workflow manual-only.

## Rollback

If the trial fails, inspect the deployment job before changing settings. The maintainer has authorized removing the Hugo build from the working tree; the original Hugo release remains recoverable in Git history. After switching to Astro-only, roll back by redeploying a known-good Astro commit through the approved manual workflow. Verify HTTPS, the custom domain, sitemap and key routes.

## Scope

- One public Astro output: `astro/dist/` hosted at `www.peroniko.xyz`.
- Public bookmark composer: `/new-bookmark/`.
- No separate admin hostname, authentication service or backend.
- Internal audit output: `astro/.audit/`, never published.
- Preflight Actions remain read-only and cannot deploy. The PR #38 merge is the explicitly authorized one-time publishing event; subsequent deployments remain manual. Release success must be verified from the Actions run and live site.
