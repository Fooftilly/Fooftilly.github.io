"""Verify first-party media JSON records against the actual rendered Astro pages.

Media is owned by content/media/ rather than any RYM/Letterboxd export.
This independent Python check runs after static build on PRs and manual releases.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, quote
import json
import re


KINDS = {"music": "Music", "films": "Films", "tv": "TV series"}


def normalized(text):
    """Apply the same whitespace normalization to both HTML and source."""
    return re.sub(r"\s+", " ", str(text).replace("\u00a0", " ")).strip()


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

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "h1":
            self.in_h1 = True
        if tag == "tbody":
            self.in_body = True
        elif tag == "tr" and self.in_body:
            if self.row is not None:
                raise AssertionError("Nested media table rows")
            self.row = {"cells": [], "links": [], "notes": [], "rating_label": ""}
        elif tag in ("th", "td") and self.row is not None:
            self.cell = {"text": [], "links": [], "aria": attrs.get("aria-label", "")}
        elif tag == "a" and self.cell is not None:
            self.anchor = {"href": attrs.get("href", ""), "text": []}
        elif tag == "details" and self.cell is not None:
            self.details_depth += 1
        elif tag == "p" and self.details_depth and "notes" in (attrs.get("class") or "").split():
            self.capture_notes = True

    def handle_data(self, text):
        if self.in_h1:
            self.h1.append(text)
        if self.capture_notes and self.row is not None:
            self.row["notes"].append(text)
        if self.cell is not None and self.details_depth == 0:
            self.cell["text"].append(text)
        if self.anchor is not None:
            self.anchor["text"].append(text)

    def handle_endtag(self, tag):
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


def normalize_external_url(value):
    """Mirror WHATWG URL's normal HTTPS host/path formatting for static hrefs.

    Astro validates links with new URL() and emits canonical hrefs. A source
    URL with no path, e.g. https://example.org, is rendered with a trailing /.
    """
    parts = urlsplit(value)
    if parts.scheme.lower() not in ("https", "http") or not parts.hostname:
        raise AssertionError("Invalid public media URL")
    if parts.username or parts.password:
        raise AssertionError("Credential-bearing media URL")
    host = parts.hostname.encode("idna").decode("ascii").lower()
    if ":" in host and not host.startswith("["):
        host = "[" + host + "]"
    if parts.port and parts.port not in (80 if parts.scheme == "http" else 443,):
        host += ":" + str(parts.port)
    # Mirror the URL serialization of the validated first-party records.
    path = quote(parts.path or "/", safe="/%:@!'()*+,;=-._~")
    # WHATWG special-scheme queries percent-encode apostrophes (unlike paths/fragments).
    # WHATWG special-query encoding preserves ASCII punctuation such as & and |
    # but escapes spaces, double/single quotes, #, <, > and non-ASCII.
    query_safe = "".join(
        chr(code) for code in range(0x21, 0x7F)
        if chr(code) not in "\"#'<>"
    )
    query = quote(parts.query, safe=query_safe)
    fragment = quote(parts.fragment, safe="/?%:@!'()*+,;=-._~")
    return urlunsplit((parts.scheme.lower(), host, path, query, fragment))


def expected_row(record):
    if record["schema"] != 1 or record["kind"] not in KINDS:
        raise AssertionError("Invalid media record schema")
    rating = record.get("rating")
    if rating is not None and (
        isinstance(rating, bool) or not isinstance(rating, (int, float))
        or not (0.5 <= rating <= 5) or (rating * 2) % 1
    ):
        raise AssertionError("Invalid rating in public record")
    links = record.get("links", [])
    return {
        "cells": [
            normalized(record["title"]),
            normalized(record.get("creator") or "—"),
            str(record["year"]) if "year" in record else "—",
            f"{rating:.1f} / 5" if rating is not None else "—",
            normalized(record.get("status") or "—"),
            normalized("".join(link["label"] for link in links)) if links else "—",
        ],
        "links": [(normalized(link["label"]), normalize_external_url(link["url"])) for link in links],
        "notes": normalized(record.get("notes") or ""),
        "rating_label": (
            f"{rating:g} out of 5 stars" if rating is not None else "Not rated"
        ),
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
            assert f"No {heading.lower()} entries have been published yet." in html, (
                f"Missing truthful {kind} empty state"
            )
            assert not parsed.rows, "Empty media collection contains unexpected table rows"
        else:
            assert "No " + heading.lower() + " entries have been published yet." not in html
        actual = Counter(json.dumps({
            **row,
            "notes": normalized("".join(row["notes"])),
        }, ensure_ascii=False, sort_keys=True) for row in parsed.rows)
        wanted = Counter(json.dumps(expected_row(data), ensure_ascii=False, sort_keys=True)
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
