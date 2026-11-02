# Private bookmark administration — deployment disabled

The owner-only bookmark composer is now a **separate Astro static build**
intended for `https://admin.peroniko.xyz/`. It must be protected by an
identity-aware access gateway **before** DNS exposure or deployment.

This directory contains configuration only. No DNS, Cloudflare Access,
hosting service, credentials, secret, or deployment has been configured.

## Build and verify

```sh
cd astro
npm ci
npm run check
npm run build
npm run check:admin
npm run build:admin
node scripts/smoke-admin-browser.mjs
```

- Public site: `astro/dist/` built by `npm run build`; no `/new-bookmark/`
  page or admin bundle, no admin link or admin sitemap entry.
- Admin site: `astro/admin-dist/` built separately by
  `npm run build:admin` using `astro.admin.config.mjs`,
  `astro/admin-src/` and its own `admin-public/`.
- Admin build has no `CNAME` for the public domain, published RSS, public
  bookmark-detail pages, or Pages deployment step.
- The form shares the typed bookmark authoring functions and the source
  Markdown collection with the public application. No GitHub write token is
  embedded in either build; commits still require GitHub authentication.
- CI builds both sites and tests output isolation and actual Vue hydration
  in Chromium. These tests are not a substitute for edge authentication.

## Owner configuration required (not performed by this PR)

1. Prepare a dedicated hosting origin for `admin.peroniko.xyz` separate
   from public GitHub Pages. For example, a private origin behind a
   Cloudflare Tunnel. Do not assume GitHub Pages can enforce per-user
   authentication on a single static route.
2. Create a Cloudflare Zero Trust Access self-hosted application matching
   the **entire** `admin.peroniko.xyz/*` hostname/path. Select a trusted
   identity provider and restrict its **Allow** policy to the owner's
   verified identity. Block everyone else. Configure an appropriate
   session duration and MFA at the identity provider.
3. Prevent origin bypass: do not leave an accessible `*.pages.dev`,
   `*.workers.dev`, public IP/origin hostname, or alternate CNAME that
   serves the same admin files without authentication. For a Pages
   deployment, confirm protection for both the custom domain and the
   default preview/origin hostname. Merely protecting a custom hostname
   is not sufficient.
4. Only after the policy and origin protection are tested, configure the
   admin hostname and upload the **admin-dist** output through a reviewed,
   explicit deployment process. There is currently **no** such workflow.
5. Test from a private browser session: unauthenticated requests must be
   challenged or denied; the selected owner signs in successfully;
   another account is refused; browser assets/API endpoints are also
   covered; and the public site does not expose the composer. Recheck on
   new preview deployments or domain changes.
6. Copy the browser bookmarklet from the admin form after configuration.
   It targets `https://admin.peroniko.xyz/` and only prefills a draft.

## Trust model

Cloudflare Access (or an equivalent reverse-proxy access gate) will own
access control. The app itself contains **no identity check** and cannot
secure a bare static origin, including its JavaScript assets and prefetched
bookmark metadata. Until the external identity gate is operational,
**do not deploy `admin-dist/` anywhere publicly reachable**.

A user with repository write permission must still review and commit
the Markdown via GitHub. Access to the admin domain does not grant GitHub
write permission. The GitHub editor's undocumented query prefill can fail;
copy the full file path and Markdown as the reliable fallback. Never
put account passwords or tokens in the URL or browser bundle.
