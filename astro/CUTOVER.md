# Astro launch and rollback runbook (pending maintainer authorization)

**Current status:** The published website remains the old Hugo GitHub Pages
site. The Astro public application and separate admin build are NOT deployed.
Automatic Pages publication remains disabled. This runbook is a gate, not an
instruction to deploy an unfinished site.

## Before any production change

1. Review the latest merged Astro public and admin PRs, unresolved security
   findings, and main-branch CI. Verify the `576` source bookmark entries,
   all nine RSS feeds, static pages, 592 public sitemap URLs, language
   metadata, mobile/keyboard behavior, and real Chrome interactions.
2. Run `cd astro && npm ci && npm test && npm run check && npm run build &&
   npm run check:admin && npm run build:admin &&
   node scripts/release-readiness.mjs`. This produces two separate outputs,
   never one combined deploy directory. The hashes in
   `astro/.audit/release-readiness.json` can be recorded with the release.
3. Confirm the English/Serbian About pages' factual technology references
   and decide whether the contact email should be obfuscated again.
   Check any remaining media/rating/comment/privacy functionality with
   the maintainer. No need to preserve legacy Hugo page URLs or redirects.
4. Provision `admin.peroniko.xyz` behind an identity-aware access gateway,
   with a policy restricted to the owner's verified identity. Test denied
   unauthenticated/other-user access **before** exposing the admin origin.
   Protect or disable ALL alternative URLs (`*.pages.dev`, preview hosts,
   direct origin IP/hostname, or any alternate tunnel path). See
   [ADMIN.md](ADMIN.md). The admin static build has NO authentication itself.
5. Confirm public Pages custom-domain/DNS ownership, SSL, required `CNAME`,
   robots, feed, sitemap, and Bing verification. Review public Cloudflare and
   GitHub Pages settings rather than assuming they are configured.
6. Get an explicit maintainer go-ahead to enable the **separate public Astro
   deployment workflow**. That workflow is not present or enabled in this PR.
   Do not configure automatic publishing at this stage.
7. Record the current published Hugo revision, Actions run and DNS/Page
   settings; preserve an immutable rollback tag/release on the existing
   GitHub branch. Existing `.github/workflows/hugo.yml` is manual-only.
8. Only after all checks and approval, implement/review the release workflow
   with least-privilege Pages permissions and an appropriately protected
   deployment environment. Deploy **only `astro/dist/`** publicly. Admin
   output MUST NOT enter the public Pages artifact.
9. After a controlled cutover, verify public pages, bookmarks, 404 behavior,
   canonical/domain, localized navigation, RSS, sitemap, security headers,
   and absence of public admin UI. Test the protected admin hostname
   separately. Review any console errors and the actual browser behavior.
10. After an acceptance period, remove obsolete Hugo workflow/theme/runtime
    only if the owner approves. Do not remove the emergency Hugo build path
    before there is a verified rollback procedure.

## Rollback

On a broken public release, use the preserved Hugo revision and manually
restore the previous GitHub Pages publication method/artifact as appropriate
for the configured Pages source. Recheck custom domain, HTTPS and sitemap.
For an admin access policy failure, remove DNS/routing to the admin origin
or shut down the admin serving process: **never** bypass the gateway to
restore access. Do not publish admin files on the public site as a fallback.

## Files and separation

- Public Astro: `astro/dist/` and `www.peroniko.xyz`
- Admin Astro: `astro/admin-dist/` and intended `admin.peroniko.xyz`
- Internal audit: `astro/.audit/`, never public
- The `release-readiness` workflow is on-demand, build-only, read-only,
  and cannot publish. Its successful result is **not** a launch approval.
