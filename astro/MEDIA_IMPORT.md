# Owner media-export reconciliation

The media catalog remains Git-owned (`content/media/{films,music,tv}/*.json`).
No provider has authority to overwrite ratings automatically.

## First pass (read-only)

Use Python 3.10+ and the original local export files:

```sh
python3 astro/scripts/reconcile-media-exports.py \
  /private/path/letterboxd-export.zip \
  /private/path/rym-film-catalog.csv \
  /private/path/rym-music-export.csv \
  --output /private/path/media-import-review.json
python3 -m unittest discover -s astro/scripts -p 'test_reconcile_media_exports.py'
```

The tool reads **only `ratings.csv` from the Letterboxd ZIP**, the RYM
film CSV, and the RYM music CSV. It excludes reviews, profile, diary,
comments, dates, ownership and other private fields. The local report
contains titles, ratings and public catalog identifiers only. **Never
commit the ZIP, raw CSVs, or generated report**: an import approval must
be explicit before publishing individual rating JSON records.

The report distinguishes exact matches, differing ratings, duplicate
identity groups, possible alternate names/release years, missing year
metadata and RYM music identities that might represent multiple
editions. Fuzzy title candidates are **suggestions for review only**.
The report intentionally generates no site data and never picks an
authoritative provider.

## Outstanding decisions before importing content

- Ask the owner to choose **each inconsistent rating**. No default
  source priority, averaging or most-recent-wins rule.
- Resolve duplicate catalog identities (different editions can share a
  title/year) without collapsing two distinct works.
- Confirm whether the intended import is rated items only, or also
  Letterboxd watchlist, watched/diary dates, or RYM unrated items. The
  existing public media schema cannot represent detailed watch dates.
- RYM `Media Type` is **physical/digital format**, not release type.
  Neither the supplied CSV nor that column identifies album, EP or
  single. Require independently verified release-group type and album
  tracklists before importing music or removing redundant singles.
  Keep standalone singles separate only after confirming their
  relationship to an album; do not silently repurpose a single's
  release rating as a track rating.
- Confirm preferred artist display names for native-script and
  localized RYM artist names rather than inventing a preference.
- Treat future track ratings as a separate, explicitly approved data
  feature: a per-track model keyed to a particular album/track identity
  and an optional local, user-provided export format. Do not scrape an
  authenticated RYM session or assign inferred track ratings.

After resolving these choices, use the existing `media-import.ts`
validator and `media-model.ts` path/identity checks for any actual
new public records. Preserve half-star precision (RYM 7/10 = 3.5/5),
reject ambiguous matches, and do not publish until the user has reviewed
the final Git diff. Publishing Pages remains separately manual.
