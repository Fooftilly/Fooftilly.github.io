#!/usr/bin/env python3
"""Read-only reconciliation of owner Letterboxd ZIP and RYM CSV exports.

Never reads reviews, biography, watch dates, ownership or other personal fields;
never writes public media records. A report is evidence, not approval.
"""
import argparse
from collections import defaultdict
import csv
from difflib import SequenceMatcher
import html
import io
import json
from pathlib import Path
import re
import unicodedata
from zipfile import ZipFile

MAX_BYTES = 15_000_000
MAX_ROWS = 50_000


def csv_rows(data: bytes, required: set[str], label: str) -> list[dict[str, str]]:
    if len(data) > MAX_BYTES:
        raise ValueError(f"{label}: source exceeds 15 MB limit")
    reader = csv.DictReader(io.StringIO(data.decode("utf-8-sig", errors="strict")))
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise ValueError(f"{label}: missing required columns {sorted(required)}")
    if len(set(reader.fieldnames)) != len(reader.fieldnames):
        raise ValueError(f"{label}: duplicate column headers")
    rows = []
    for row in reader:
        if len(rows) >= MAX_ROWS or None in row:
            raise ValueError(f"{label}: invalid or oversized CSV")
        rows.append(row)
    return rows


def source_rows(zip_path: Path, film_path: Path, music_path: Path):
    with ZipFile(zip_path) as archive:
        matches = [info for info in archive.infolist() if info.filename == "ratings.csv"]
        if len(matches) != 1 or matches[0].file_size > MAX_BYTES:
            raise ValueError("Letterboxd ZIP requires one ratings.csv within size limit")
        # Explicitly ignore reviews.csv, diary.csv, profile.csv and other files.
        letterboxd = csv_rows(archive.read(matches[0]),
                             {"Name", "Year", "Rating", "Letterboxd URI"}, "Letterboxd")
    rym_films = csv_rows(film_path.read_bytes(),
                         {"Film_ID", "Title", "Release_Date", "Rating"}, "RYM film")
    rym_music = csv_rows(music_path.read_bytes(),
                         {"RYM Album", "Title", "Release_Date", "Rating",
                          " First Name", "Last Name"}, "RYM music")
    return letterboxd, rym_films, rym_music


def key(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", html.unescape(text).casefold())
    return "".join(char for char in normalized if char.isalnum() and not unicodedata.combining(char))


def without_leading_article(text: str) -> str:
    return re.sub(r"^(the|an|a|le|la|les|el)\s+", "", text.strip(), flags=re.IGNORECASE)


def year(text: str) -> str:
    if not text.strip():
        return ""  # Missing year is reported for review, never guessed.
    match = re.match(r"^(?:18|19|20|21)\d{2}", text)
    if not match:
        raise ValueError("Missing or malformed release year in export")
    return match.group(0)


def rating(text: str, source: str) -> float | None:
    try:
        value = float(text)
    except ValueError as exc:
        raise ValueError(f"Invalid {source} rating") from exc
    if source == "RYM":
        if int(value) != value or not 0 <= value <= 10:
            raise ValueError("RYM rating must be an integer 0–10")
        return value / 2 if value else None
    if not 0.5 <= value <= 5 or int(value * 2) != value * 2:
        raise ValueError("Letterboxd rating must be 0.5–5 in half-star increments")
    return value


def film_item(row: dict[str, str], provider: str) -> dict:
    title = row["Name"] if provider == "Letterboxd" else row["Title"]
    recorded_year = year(row["Year"] if provider == "Letterboxd" else row["Release_Date"])
    source_id = row["Letterboxd URI"] if provider == "Letterboxd" else row["Film_ID"]
    return {"title": title, "year": recorded_year,
            "rating": rating(row["Rating"], provider), "source_id": source_id}


def group(items: list[dict]) -> dict[tuple[str, str], list[dict]]:
    result = defaultdict(list)
    for item in items:
        result[(key(item["title"]), item["year"])].append(item)
    return result


def reconcile(letterboxd: list[dict], rym_films: list[dict], rym_music: list[dict]) -> dict:
    lb = group([film_item(row, "Letterboxd") for row in letterboxd if row["Rating"].strip()])
    ry = group([film_item(row, "RYM") for row in rym_films
                if row["Rating"].strip() and rating(row["Rating"], "RYM") is not None])
    all_keys = sorted(set(lb) | set(ry))
    missing_year_films = [item for values in (lb, ry) for records in values.values()
                          for item in records if not item["year"]]
    conflicts, duplicate_films, matched = [], [], []
    for match_key in all_keys:
        first, second = lb.get(match_key, []), ry.get(match_key, [])
        if len(first) > 1 or len(second) > 1:
            duplicate_films.append({"title": (first or second)[0]["title"],
                                    "year": match_key[1], "letterboxd": first, "rym": second})
        elif first and second:
            entry = {"title": first[0]["title"], "year": match_key[1],
                     "letterboxd": first[0]["rating"], "rym": second[0]["rating"]}
            (matched if first[0]["rating"] == second[0]["rating"] else conflicts).append(entry)
    # Possible alternate titles and year metadata discrepancies require review.
    # Similarity is only used to flag candidates, never to merge records.
    aliases = []
    for (title_key, film_year), records in sorted(ry.items()):
        if (title_key, film_year) in lb or not film_year:
            continue
        candidates = []
        for (other_title, other_year), films in lb.items():
            if not other_year or abs(int(other_year) - int(film_year)) > 1:
                continue
            similarity = SequenceMatcher(None, title_key, other_title).ratio()
            if (other_title == title_key or
                    (film_year == other_year and (similarity >= 0.84 or
                     key(without_leading_article(records[0]["title"])) ==
                     key(without_leading_article(films[0]["title"]))))):
                candidates.append((similarity, films[0]))
        if candidates:
            candidates.sort(key=lambda pair: (-pair[0], pair[1]["title"]))
            aliases.append({"rym": records[0], "letterboxd_candidate": candidates[0][1]})
    grouped_music = defaultdict(list)
    rated_music = unrated_music = 0
    for row in rym_music:
        value = rating(row["Rating"], "RYM")
        if value is None:
            unrated_music += 1
            continue
        rated_music += 1
        # Use both representations for collision analysis only; do not choose
        # public artist display names without owner approval.
        native = " ".join(filter(None, (row[" First Name"].strip(), row["Last Name"].strip())))
        localized = " ".join(filter(None, (row.get("First Name localized", "").strip(),
                                            row.get(" Last Name localized", "").strip())))
        artist = native or localized
        grouped_music[(key(artist), key(row["Title"]), year(row["Release_Date"]))].append({
            "artist": native, "artist_localized": localized,
            "title": row["Title"], "year": year(row["Release_Date"]),
            "rating": value, "rym_id": row["RYM Album"]})
    duplicate_music = [items for items in grouped_music.values() if len(items) > 1]
    return {
        "summary": {
            "letterboxd_rated_films": sum(map(len, lb.values())),
            "rym_rated_films": sum(map(len, ry.values())),
            "films_same_identity_and_rating": len(matched),
            "films_rating_conflicts": len(conflicts),
            "film_duplicate_identity_groups": len(duplicate_films),
            "film_possible_title_or_year_aliases": len(aliases),
            "films_missing_release_year": len(missing_year_films),
            "rym_music_rated_releases": rated_music,
            "rym_music_unrated_releases": unrated_music,
            "rym_music_duplicate_identity_groups": len(duplicate_music),
            "rym_music_release_type_verified": 0,
        },
        "rating_conflicts": conflicts,
        "duplicate_films": duplicate_films,
        "missing_year_films": missing_year_films,
        "possible_film_aliases": aliases,
        "duplicate_music": duplicate_music,
        "release_type_warning": "RYM Media Type is a storage format, not album/single release type. Do not import music until release types and album-track relationships are verified.",
        "not_imported": ["reviews", "comments", "diary", "profile", "ownership",
                         "unrated music", "all media pending review"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("letterboxd_zip", type=Path)
    parser.add_argument("rym_films_csv", type=Path)
    parser.add_argument("rym_music_csv", type=Path)
    parser.add_argument("--output", type=Path, help="Write local JSON report; never writes public media")
    args = parser.parse_args()
    report = reconcile(*source_rows(args.letterboxd_zip, args.rym_films_csv,
                                    args.rym_music_csv))
    if args.output:
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                               encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print("Preview only: no media JSON, reviews, or owner exports were added to Git.")


if __name__ == "__main__":
    main()
