#!/usr/bin/env python3
"""Verify RYM rated releases as MusicBrainz Albums before any music import.

Safe default: offline, read-only and no public file writes. With --fetch, makes
rate-limited public metadata requests to MusicBrainz and caches responses
locally. RYM ratings, ownership and reviews are never sent to MusicBrainz.
"""
import argparse
import csv
import html
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ENDPOINT = "https://musicbrainz.org/ws/2/release-group/"
USER_AGENT = "PeronikoAlbumVerification/1.0 (+https://github.com/Fooftilly/Fooftilly.github.io)"
MAX_BYTES = 15_000_000
MAX_ROWS = 50_000
HEADERS = {"RYM Album", " First Name", "Last Name", "First Name localized",
           " Last Name localized", "Title", "Release_Date", "Rating"}


def text_key(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", html.unescape(text).casefold())
    return "".join(char for char in normalized if char.isalnum() and
                   not unicodedata.combining(char))


def artist_names(row: dict[str, str]) -> list[str]:
    values = []
    for first, last in ((" First Name", "Last Name"),
                        ("First Name localized", " Last Name localized")):
        value = " ".join(filter(None, (row.get(first, "").strip(),
                                      row.get(last, "").strip())))
        if value and text_key(value) not in {text_key(old) for old in values}:
            values.append(value)
    return values


def read_rated(path: Path) -> list[dict[str, str]]:
    data = path.read_bytes()
    if len(data) > MAX_BYTES:
        raise ValueError("RYM CSV exceeds 15 MB")
    reader = csv.DictReader(data.decode("utf-8-sig", errors="strict").splitlines())
    if not reader.fieldnames or not HEADERS.issubset(set(reader.fieldnames)):
        raise ValueError("Missing RYM music columns")
    result = []
    for row in reader:
        if len(result) >= MAX_ROWS or None in row:
            raise ValueError("Malformed or oversized RYM music CSV")
        raw = row["Rating"].strip()
        if not raw:
            raise ValueError("Music rating column missing")
        try:
            value = int(raw)
        except ValueError as error:
            raise ValueError("RYM ratings must be integer 0–10") from error
        if not 0 <= value <= 10:
            raise ValueError("RYM rating outside 0–10")
        if value == 0:  # Owner confirms these are singles; never imported.
            continue
        if not row["RYM Album"].strip() or not row["Title"].strip():
            raise ValueError("Missing RYM release ID or title")
        result.append(row)
    return result


def first_release_year(group: dict) -> int | None:
    raw = group.get("first-release-date", "")
    match = re.match(r"^(?:18|19|20|21)\d{2}", raw)
    return int(match.group(0)) if match else None


def classify(row: dict[str, str], response: dict) -> dict:
    """Fail closed on uncertain matches, unknown types and conflicting editions."""
    source_id = row["RYM Album"].strip()
    title = row["Title"].strip()
    source_year = re.match(r"^(?:18|19|20|21)\d{2}", row["Release_Date"])
    names = artist_names(row)
    if not source_year or not names:
        return {"rym_id": source_id, "title": title, "classification": "needs_review",
                "reason": "missing year or artist"}
    year = int(source_year.group(0))
    matches = []
    for group in response.get("release-groups", []):
        if text_key(group.get("title", "")) != text_key(title):
            continue
        credit = "".join(part if isinstance(part, str) else part.get("name", "")
                         for part in group.get("artist-credit", []))
        if text_key(credit) not in {text_key(name) for name in names}:
            continue
        first_year = first_release_year(group)
        if first_year is None or abs(first_year - year) > 1:
            continue
        if not group.get("id") or not group.get("primary-type"):
            continue
        matches.append(group)
    if len(matches) != 1:
        return {"rym_id": source_id, "title": title, "classification": "needs_review",
                "reason": "no unique exact title/artist/year release group",
                "candidate_count": len(matches)}
    matched = matches[0]
    primary_type = matched["primary-type"]
    return {
        "rym_id": source_id, "title": title, "classification":
            "album" if primary_type == "Album" else "not_album",
        "musicbrainz_release_group": matched["id"],
        "primary_type": primary_type,
    }


def release_group_lookup(title: str, artist: str) -> dict:
    # Quote Lucene field operands. Only titles and public artist names are sent.
    def quote(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
    query = "releasegroup:" + quote(title) + " AND artist:" + quote(artist)
    url = ENDPOINT + "?" + urlencode({"query": query, "fmt": "json", "limit": 30})
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(req, timeout=20) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("MusicBrainz response exceeds 15 MB")
    return json.loads(data.decode("utf-8"))


def verify(rows: list[dict[str, str]], cache: dict, fetch: bool) -> dict:
    results = []
    calls = 0
    for row in rows:
        names = artist_names(row)
        source_id = row["RYM Album"].strip()
        # Include the current source identity in cache keys: stale responses
        # must not silently classify a changed artist, title or release.
        identity = json.dumps([source_id, row["Title"], row["Release_Date"], names],
                              ensure_ascii=False, separators=(",", ":"))
        cached = cache.get(identity)
        if cached is None and fetch:
            # All lookups (including alternate artist spellings) share a single
            # rate limit across the process. Do not suppress 429/503 errors.
            groups = {}
            for artist in names:
                if calls:
                    time.sleep(1.1)
                response = release_group_lookup(row["Title"], artist)
                calls += 1
                for group in response.get("release-groups", []):
                    if group.get("id"):
                        groups[group["id"]] = group
            cached = {"release-groups": list(groups.values())}
            cache[identity] = cached
        if cached is None:
            results.append({"rym_id": source_id, "title": row["Title"],
                            "classification": "needs_review",
                            "reason": "no cached public metadata; run with --fetch"})
        else:
            results.append(classify(row, cached))
    counts = {k: sum(item["classification"] == k for item in results)
              for k in ("album", "not_album", "needs_review")}
    return {"summary": counts, "releases": results}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("rym_music_csv", type=Path)
    parser.add_argument("--cache", required=True, type=Path,
                        help="Local private JSON cache of MusicBrainz responses")
    parser.add_argument("--output", required=True, type=Path,
                        help="Local private classification report, not a media import")
    parser.add_argument("--fetch", action="store_true",
                        help="Explicitly opt into rate-limited public metadata lookups")
    args = parser.parse_args()
    rows = read_rated(args.rym_music_csv)
    cache = json.loads(args.cache.read_text(encoding="utf-8")) if args.cache.exists() else {}
    if not isinstance(cache, dict):
        raise ValueError("Cache must be a JSON object")
    try:
        result = verify(rows, cache, args.fetch)
    finally:
        if args.fetch:
            args.cache.write_text(json.dumps(cache, ensure_ascii=False, indent=2) + "\n",
                                  encoding="utf-8")
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))
    print("Only explicit classifications of Album may enter the music catalog.")
    print("No raw exports or music JSON were committed or published.")


if __name__ == "__main__":
    main()
