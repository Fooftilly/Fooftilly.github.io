# Peroniko

A personal website hosted on [GitHub Pages](https://pages.github.com/), built from Git-managed Markdown with [Astro](https://astro.build/) and [Vue](https://vuejs.org/).

## Development

Requires Node.js 24 and npm.

```sh
cd astro
npm ci
npm test
npm run check
npm run build
npm run dev
```

The public site is generated in `astro/dist/`. Source bookmarks and bilingual page content remain under `content/`; static assets, custom-domain configuration and verification files remain under `static/`. Do not commit generated `dist/` or internal `.audit/` records.

Bookmark proposals are prepared at `/new-bookmark/` and reviewed through GitHub. The form is public and contains no write credentials; repository permissions control who can open pull requests. See [Astro documentation](astro/README.md), [cutover and rollback runbook](astro/CUTOVER.md), and [migration roadmap](https://github.com/Fooftilly/Fooftilly.github.io/issues/11).

## Credits and licenses

The featured image adapts [Attributes of Art and Illustration](https://www.oldbookillustrations.com/illustrations/attributes-art-illustration/) ([CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)). The language icon is credited to Onur Müştak Çobanlı and Farhat Datta at [languageicon.org](https://www.languageicon.org/), subject to that asset's license.

Published posts are licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). Other source assets retain their respective licenses.
