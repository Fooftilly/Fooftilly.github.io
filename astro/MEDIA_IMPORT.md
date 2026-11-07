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
  --decisions astro/scripts/media-import-decisions.json \
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

## Confirmed scope and staged film import (November 7, 2026)

Owner decisions: **rated films and albums only**. Exclude unrated RYM
entries (owner identifies them as singles), Letterboxd watchlist/diary,
and all reviews. No TV/anime scores are available for import yet.

Draft PR #99 stages **2,082 rated-film records** without review, diary or
ownership fields. That is 2,079 conservative export candidates plus two
separately identified 1922 `Cinderella` films and one Letterboxd film with
no recorded release year. The last three use no guessed metadata or reviews. An independently coded pass canonicalized 12
Unicode-derived paths to the website's exact `mediaSlug` behavior.
The film batch passed required Astro staging, TypeScript/JavaScript
analysis, workflow syntax, and actions security checks.

The owner chose each of the five actual rating conflicts; the
choices are committed in `scripts/media-import-decisions.json`:

| Film | Selected provider | Stars |
| --- | --- | --- |
| Before Sunset (2004) | RYM | 4 |
| Blue Velvet (1986) | Letterboxd | 4 |
| Parker (2013) | Letterboxd | 3.5 |
| Sherlock: The Abominable Bride (2016) | RYM | 3 |
| Steamboat Willie (1928) | Letterboxd | 2.5 |

Metadata verified independently:
- `Ex Machina`: original BFI catalog year **2014**, with A24 release
  2015. [BFI](https://www.bfi.org.uk/film/337a9bd9-b9af-589e-8607-04105282d41f/ex-machina),
  [A24](https://a24films.com/films/ex-machina).
- `Heathers`: BFI and AFI theatrical year **1989**, although 1988
  industry screenings exist.
  [BFI](https://www.bfi.org.uk/film/b1df45fb-9a2b-507a-803b-b00114a8fe29/heathers),
  [AFI](https://catalog.afi.com/Film/58108-HEATHERS).
- `Meeting the Man: James Baldwin in Paris`: the year is
  **unresolved** because [Criterion](https://www.criterionchannel.com/films/Eez36hjg/meeting-the-man-james-baldwin-in-paris)
  gives 1970 and [Film at Lincoln Center](https://www.filmlinc.org/films/meeting-the-man-james-baldwin-in-paris/)
  gives 1971. Both export entries are withheld.
- Two `Cinderella` films from 1922 are **distinct** (directors Lotte
  Reiniger and Walt Disney), not duplicates.
  [Reiniger](https://letterboxd.com/film/cinderella-1922/),
  [Disney](https://letterboxd.com/film/cinderella-1922-1/).
  Both distinct works are now staged as independent records with their
  verified directors and identical owner-provided 1.5-star scores, **without
  assigning the two unverified export shortlinks** to either work.
- The rated Letterboxd `Fashions - Filmed In Paris` entry is now staged
  with **no year** because the source omits one. Do not fabricate a release year.
- `Marie Antoinette` (2006) and `Marie-Antoinette` (2006) need
  independent identity matching against their source IDs before the
  extra RYM record is imported. Never merge the records by title/year.

The local preview listed 132 same-year article/alias matches with
identical ratings. They are logged separately for audit and omitted as
potential duplicates; **no new or changed rating was inferred from a
fuzzy match**.

## Track, season and episode ratings

The first-party model supports optional:
- `music.tracks[]`: `{disc, number, title, rating?}`; disc/track
  positions unique within an album, up to 500 per album.
- `tv.seasons[]`: `{number, title?, rating?, episodes?}`.
  Season 0 is specials; each episode has `{number, title?, rating?}`
  and numbering restarts per season.
- All optional ratings use 0.5–5 stars in 0.5 steps and are **never
  inferred** from album/series totals. Film entries cannot have tracks
  or seasons. New-media provides explicit editors and collection pages
  show details without JavaScript; the independent build audit checks
  their static source-to-HTML parity.

No current source CSV provides track, TV, season or episode ratings.
Those values remain empty pending the owner's future input.

## Album verification boundary

**Being rated does not prove a release is an album.** The export
contains explicitly named EPs (for example, Agalloch's `The White EP`
and Slowdive's `Outside Your Room EP`), and Kate Bush's `4 Sucessos`
appears twice with conflicting ratings. RYM's `Media Type` describes
physical/digital format, not the release-group type. These are withheld.
Only release groups independently identified as actual albums should
be included. Prefer MusicBrainz `primary-type=Album` (or equally
authoritative release metadata), and exclude Singles/EPs/Other.

A strictly opt-in offline-first verifier is included:

```sh
python3 astro/scripts/verify-rym-albums.py \
  /private/path/rym-music-export.csv \
  --cache /private/path/verified-musicbrainz-cache.json \
  --output /private/path/verified-album-types.json
# The command above reads cached responses only. To request missing public
# metadata from MusicBrainz at no more than 1 request/second, rerun with --fetch.
```

The report approves an album only when MusicBrainz supplies one unique
title/artist/first-release-year match with `primary-type: Album`.
EPs, singles, other types, missing matches, different editions and ambiguous
identities are rejected or held for review. Network access is opt-in,
rate-limited and not used by CI, runtime pages or publication. Only public
artist/title metadata is queried; ratings and ownership are not transmitted.
MusicBrainz documents release-group primary types and API rate limits:
[release-group search](https://musicbrainz.org/doc/MusicBrainz_API/Search/ReleaseGroupSearch),
[rate limiting](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting).

The music export also contains native-script and localized artist names
for different entries. No display-name preference has been assumed:
affected entries need explicit owner choice before import.

## Outstanding decisions before importing content

- The five conflicting film ratings are confirmed; new mismatches still require
  explicit approval, without provider priority, averaging or most-recent-wins.
- Resolve duplicate catalog identities (different editions can share a
  title/year) without collapsing two distinct works.
- Rated films and verified albums only. Watchlist, diary and unrated music are
  explicitly out of scope, not implicitly assigned a zero rating.
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
