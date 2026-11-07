"""Verify first-party media JSON records against the actual rendered Astro pages.

Media is owned by content/media/ rather than any RYM/Letterboxd export.
This independent Python check runs after static build on PRs and manual releases.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import json
import re
import subprocess
import unicodedata
from urllib.parse import quote


KINDS = {"music": "Music", "films": "Films", "tv": "TV series"}


def normalized(text):
    """Apply the same whitespace normalization to both HTML and source."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", str(text).replace("\u00a0", " ")).strip())


class MediaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.in_body = False
        self.row = None
        self.cell = None
        self.anchor = None
        self.details_depth = 0
        self.capture_notes = False
        self.h1 = []
        self.in_h1 = False
        self.nested_item = None
        self.season_active = False
        self.season_heading = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h1":
            self.in_h1 = True
        if tag == "tbody":
            self.in_body = True
        elif tag == "tr" and self.in_body:
            if self.row is not None:
                raise AssertionError("Nested media table rows")
            self.row = {"cells": [], "links": [], "notes": [], "rating_label": "",
                        "tracks": [], "seasons": [], "episodes": [],
                        "visible_tracks": [], "visible_seasons": [], "visible_episodes": []}
        elif tag in ("th", "td") and self.row is not None:
            self.cell = {"text": [], "links": [], "aria": attrs.get("aria-label", "")}
        elif tag == "a" and self.cell is not None:
            self.anchor = {"href": attrs.get("href", ""), "text": []}
        elif tag == "details" and self.cell is not None:
            self.details_depth += 1
        elif tag == "p" and self.details_depth and "notes" in (attrs.get("class") or "").split():
            self.capture_notes = True

        # Verify actual source-specific nested scores rendered inside <details>.
        # The attributes are JSON owned by the static Astro renderer; no reviews
        # or browser-only state is included in these parity checks.
        if self.row is not None:
            for attribute, target in (
                ("data-media-track", "tracks"),
                ("data-media-season", "seasons"),
                ("data-media-episode", "episodes"),
            ):
                if attribute in attrs:
                    self.row[target].append(json.loads(attrs[attribute]))
            if tag == "section" and "data-media-season" in attrs:
                self.season_active = True
            elif tag == "h4" and self.season_active:
                self.season_heading = {"text": [], "rating_aria": None}
            elif tag == "li":
                kind = ("tracks" if "data-media-track" in attrs else
                        "episodes" if "data-media-episode" in attrs else None)
                if kind:
                    assert self.nested_item is None, "Nested media scores must not overlap"
                    self.nested_item = {"kind": kind, "text": [], "rating_aria": None}
            if tag == "span":
                # Adjacent Vue-rendered spans need a semantic separator even
                # when SSR does not emit a literal whitespace text node.
                if self.nested_item is not None:
                    self.nested_item["text"].append(" ")
                if self.season_heading is not None:
                    self.season_heading["text"].append(" ")
                if "aria-label" in attrs:
                    if self.nested_item is not None:
                        self.nested_item["rating_aria"] = attrs["aria-label"]
                    elif self.season_heading is not None:
                        self.season_heading["rating_aria"] = attrs["aria-label"]

    def handle_data(self, text):
        if self.nested_item is not None:
            self.nested_item["text"].append(text)
        if self.season_heading is not None:
            self.season_heading["text"].append(text)
        if self.in_h1:
            self.h1.append(text)
        if self.capture_notes and self.row is not None:
            self.row["notes"].append(text)
        if self.cell is not None and self.details_depth == 0:
            self.cell["text"].append(text)
        if self.anchor is not None:
            self.anchor["text"].append(text)

    def handle_endtag(self, tag):
        if tag == "li" and self.nested_item is not None and self.row is not None:
            item = self.nested_item
            self.row["visible_" + item["kind"]].append({
                "text": normalized("".join(item["text"])),
                "rating_aria": item["rating_aria"],
            })
            self.nested_item = None
        elif tag == "h4" and self.season_heading is not None and self.row is not None:
            item = self.season_heading
            self.row["visible_seasons"].append({
                "text": normalized("".join(item["text"])),
                "rating_aria": item["rating_aria"],
            })
            self.season_heading = None
        elif tag == "section" and self.season_active:
            self.season_active = False
        if tag == "h1":
            self.in_h1 = False
        if tag == "a" and self.anchor is not None:
            self.cell["links"].append(
                (normalized("".join(self.anchor["text"])), self.anchor["href"])
            )
            self.anchor = None
        elif tag == "p" and self.capture_notes:
            self.capture_notes = False
        elif tag == "details" and self.details_depth:
            self.details_depth -= 1
        elif tag in ("th", "td") and self.cell is not None:
            self.row["cells"].append(normalized("".join(self.cell["text"])))
            self.row["links"].extend(self.cell["links"])
            if self.cell["aria"]:
                self.row["rating_label"] = self.cell["aria"]
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None
        elif tag == "tbody":
            self.in_body = False


def normalize_external_urls(values):
    """Canonicalize all links in one Node process, independently of rendered HTML.

    The source records and actual anchor hrefs are still audited by Python.
    Browser URL semantics must come from the same WHATWG implementation as Astro.
    """
    if not values:
        return {}
    try:
        result = subprocess.run(
            ["node", str(Path(__file__).with_name("canonicalize-media-urls.mjs"))],
            input=json.dumps(values, ensure_ascii=False),
            capture_output=True, text=True, check=False, timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AssertionError("Unable to run the Node.js URL serializer") from exc
    if result.returncode:
        raise AssertionError("Invalid public media URL: " + result.stderr.strip())
    canonical = json.loads(result.stdout)
    assert isinstance(canonical, list) and len(canonical) == len(values), (
        "URL serializer returned an invalid result"
    )
    return dict(zip(values, canonical))


def normalize_external_url(value):
    """Canonicalize a single public HTTP(S) URL; used by regression tests."""
    return normalize_external_urls([value])[value]

def rendered_year(record):
    """Match the JS model's integral year validation and table formatting."""
    if "year" not in record:
        return "—"
    year = record["year"]
    if (isinstance(year, bool) or not isinstance(year, (int, float))
            or not 1800 <= year <= 2200 or int(year) != year):
        raise AssertionError("Invalid year in public record")
    return str(int(year))


def normalized_nested_title(value):
    return unicodedata.normalize("NFC", value.strip())


def normalized_nested_record(record):
    result = dict(record)
    if "title" in result:
        result["title"] = normalized_nested_title(result["title"])
    return result


def nested_rating_text(value):
    return "Not rated" if value is None else f"{value:.1f} / 5"


def nested_rating_aria(kind, value):
    return f"{kind} not rated" if value is None else f"{value:g} out of 5 stars"


def visible_nested(text, kind, value):
    return {"text": normalized(text + " " + nested_rating_text(value)),
            "rating_aria": nested_rating_aria(kind, value)}


def source_media_links(record):
    """Independently reconstruct compact URL references for static parity."""
    values = []
    for platform, identity in record.get("refs", {}).items():
        if not isinstance(identity, str):
            raise AssertionError("Invalid source media reference ID")
        if platform == "imdb" and re.fullmatch(r"tt[0-9]{7,}", identity):
            url, label = f"https://www.imdb.com/title/{identity}/", "IMDb"
        elif platform == "tmdb" and re.fullmatch(r"(movie|tv):[1-9][0-9]*", identity):
            category, number = identity.split(":")
            url, label = f"https://www.themoviedb.org/{category}/{number}", "TMDb"
        elif platform == "wikipedia" and re.fullmatch(
                r"[a-z]{2,12}:[^\\/?#\x00-\x1f]{1,220}", identity):
            language, title = identity.split(":", 1)
            url = f"https://{language}.wikipedia.org/wiki/" + quote(
                title, safe="-_.!~*'()")
            label = "Wikipedia"
        elif platform == "letterboxd" and re.fullmatch(r"[A-Za-z0-9]{2,16}", identity):
            url, label = f"https://boxd.it/{identity}", "Letterboxd"
        elif platform == "musicbrainz" and re.fullmatch(
                r"[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}", identity):
            url, label = "https://musicbrainz.org/release-group/" + identity.lower(), "MusicBrainz"
        else:
            raise AssertionError("Invalid compact media reference")
        values.append({"label": label, "url": url})
    values.extend(record.get("links", []))
    if len({entry["url"] for entry in values}) != len(values):
        raise AssertionError("Duplicate media reference URL")
    return values


def expected_row(record, canonical_urls=None):
    if record["schema"] != 1 or record["kind"] not in KINDS:
        raise AssertionError("Invalid media record schema")
    rating = record.get("rating")
    if rating is not None and (
        isinstance(rating, bool) or not isinstance(rating, (int, float))
        or not (0.5 <= rating <= 5) or (rating * 2) % 1
    ):
        raise AssertionError("Invalid rating in public record")
    links = source_media_links(record)
    tracks = [normalized_nested_record(t) for t in record.get("tracks", [])]
    seasons = [normalized_nested_record(s) for s in record.get("seasons", [])]
    episodes = [(s["number"], normalized_nested_record(e))
                for s in seasons for e in s.get("episodes", [])]
    return {
        "cells": [
            normalized(record["title"]),
            normalized(record.get("creator") or "—"),
            rendered_year(record),
            f"{rating:.1f} / 5" if rating is not None else "—",
            normalized({"finished": "Finished", "in-progress": "In progress", "planned": "Planned"}.get(record.get("status"), "—")),
            normalized("".join(normalized(link["label"]) for link in links)) if links else "—",
        ],
        "links": [(normalized(link["label"]),
                   canonical_urls[link["url"]] if canonical_urls is not None
                   else normalize_external_url(link["url"])) for link in links],
        "notes": normalized(record.get("notes") or ""),
        "rating_label": (
            f"{rating:g} out of 5 stars" if rating is not None else "Not rated"
        ),
        "tracks": tracks,
        "visible_tracks": [
            visible_nested(f'{t["disc"]}.{t["number"]} — {t["title"]}',
                           "Track", t.get("rating"))
            for t in tracks
        ],
        "visible_seasons": [
            visible_nested(
                ("Specials" if s["number"] == 0 else f'Season {s["number"]}') +
                (f' — {s["title"]}' if s.get("title") else ""),
                "Season", s.get("rating"))
            for s in seasons
        ],
        "visible_episodes": [
            visible_nested(
                f'Episode {e["number"]}' + (f' — {e["title"]}' if e.get("title") else ""),
                "Episode", e.get("rating"))
            for _, e in episodes
        ],
        "seasons": [
            {field: season[field] for field in ("number", "title", "rating")
             if field in season}
            for season in seasons
        ],
        "episodes": [
            {"season": season_number, **episode}
            for season_number, episode in episodes
        ],
    }


def verify_media_output(root: Path):
    """Compare complete rendered data for each media item, ignoring row order."""
    source = root.parent / "content" / "media"
    dist = root / "dist"
    assert source.is_dir() and dist.is_dir(), "Missing media source or build output"
    total = 0
    for kind, heading in KINDS.items():
        page = dist / kind / "index.html"
        assert page.is_file(), f"Missing {kind} page"
        html = page.read_text(encoding="utf-8")
        parsed = MediaParser()
        parsed.feed(html)
        assert normalized("".join(parsed.h1)) == heading, f"Wrong {kind} heading"
        records = []
        for path in sorted((source / kind).glob("*.json")):
            assert re.fullmatch(r"[\w-]+\.json", path.name, flags=re.UNICODE), path
            data = json.loads(path.read_text(encoding="utf-8"))
            assert data["kind"] == kind, f"Media kind/path mismatch in {path}"
            records.append(data)
        if not records:
            assert f"No {heading.lower()} yet." in html, (
                f"Missing truthful {kind} empty state"
            )
            assert not parsed.rows, "Empty media collection contains unexpected table rows"
        else:
            assert f"No {heading.lower()} yet." not in html
        actual = Counter(json.dumps({
            **row,
            "notes": normalized("".join(row["notes"])),
        }, ensure_ascii=False, sort_keys=True) for row in parsed.rows)
        # Batch URL canonicalization once per catalog, not once per record.
        source_urls = list(dict.fromkeys(
            link["url"] for data in records for link in source_media_links(data)
        ))
        canonical_urls = normalize_external_urls(source_urls)
        wanted = Counter(json.dumps(expected_row(data, canonical_urls),
                                    ensure_ascii=False, sort_keys=True)
                         for data in records)
        assert actual == wanted, (
            f"{kind} rendered data mismatch: missing {list((wanted-actual).elements())[:3]}, "
            f"unexpected {list((actual-wanted).elements())[:3]}"
        )
        assert 'src="https://www.googletagmanager.com/' not in html, (
            f"{kind} page preloads GA before consent"
        )
        total += len(records)
    print(f"Verified {total} independent media records across music, film and TV pages")
    return total


if __name__ == "__main__":
    verify_media_output(Path(__file__).resolve().parents[1])
