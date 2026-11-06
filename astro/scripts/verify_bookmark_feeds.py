"""Validate generated RSS as XML and compare all items with the validated Astro manifest.

Runs after npm run test:parity. Only Python stdlib; no packages or network.
"""
import json
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
SITE = "https://www.peroniko.xyz"
CATEGORIES = {
    "art": "Art",
    "fun": "Fun",
    "music": "Music",
    "paperbookarticle": "PaperBookArticle",
    "perspectives": "Perspectives",
    "resource": "Resource",
    "youtube": "YouTube",
}


def verify_feed(feed_path, expected_records, expected_channel_url):
    document = ET.parse(feed_path)
    root = document.getroot()
    assert root.tag == "rss" and root.attrib.get("version") == "2.0", feed_path
    channel = root.find("channel")
    assert channel is not None, feed_path
    assert channel.findtext("link") == expected_channel_url, feed_path
    assert channel.findtext("language") == "en", feed_path
    assert (channel.findtext("title") or "").startswith("Peroniko"), ("Old RSS branding", feed_path)

    items = channel.findall("item")
    assert len(items) == len(expected_records), (feed_path, len(items), len(expected_records))
    actual = {}
    for item in items:
        guid = item.findtext("guid")
        assert guid is not None and guid.startswith("urn:peroniko:bookmark:"), guid
        assert guid not in actual, ("duplicate RSS guid", guid)
        assert item.find("guid").attrib.get("isPermaLink") == "false", guid
        actual[guid] = item

    # Validate the sequence subscribers actually receive (not only an
    # unordered equality of GUID sets). ISO dates sort lexically, with
    # missing dates sorted last. Title/ID tie-breaking is unit-tested in JS.
    expected_by_guid = {
        "urn:peroniko:bookmark:" + rec["id"]: rec for rec in expected_records
    }
    published_guids = [item.findtext("guid") for item in items]
    published_dates = [expected_by_guid[guid]["date"] for guid in published_guids]
    assert published_dates == sorted(published_dates, reverse=True), (
        "RSS publication is not ordered newest-first", feed_path
    )

    for record in expected_records:
        guid = "urn:peroniko:bookmark:" + record["id"]
        assert guid in actual, ("missing RSS item", feed_path, guid)
        item = actual[guid]
        assert item.findtext("title") == record["title"], guid
        assert item.findtext("description") == (record["comments"] or record["title"]), guid
        expected_link = record["url"] or SITE + record["detailUrl"]
        assert item.findtext("link") == expected_link, (guid, expected_link)
        published = item.findtext("pubDate")
        if record["date"]:
            assert published is not None, guid
            expected = datetime.fromisoformat(record["date"]).replace(tzinfo=timezone.utc)
            assert parsedate_to_datetime(published) == expected, guid
        else:
            assert published is None, guid

    assert set(actual) == {"urn:peroniko:bookmark:" + rec["id"] for rec in expected_records}
    # Date ordering is tested by the pure bookmark selector unit tests.
    print(f"{feed_path.relative_to(DIST)}: {len(items)} verified RSS items")


def main():
    manifest = ROOT / ".audit/bookmarks-parity.json"
    entries = json.loads(manifest.read_text(encoding="utf-8"))
    baseline = json.loads((ROOT / "tests/fixtures/legacy-bookmark-ids.json").read_text(encoding="utf-8"))
    assert len(baseline) == len(set(baseline)) == 576, "Invalid legacy bookmark baseline"
    ids = [entry["id"] for entry in entries]
    assert len(ids) == len(set(ids)), "Duplicate bookmark in feed parity manifest"
    missing = set(baseline) - set(ids)
    assert not missing, ("Original bookmark entries missing from RSS input", sorted(missing))
    assert len(entries) >= len(baseline)
    verify_feed(DIST / "index.xml", entries, SITE + "/")
    verify_feed(DIST / "bookmarks/index.xml", entries, SITE + "/bookmarks/")
    for slug, section in CATEGORIES.items():
        subset = [entry for entry in entries if entry["id"].startswith(section + "/")]
        assert subset, section
        assert (DIST / f"bookmarks/{slug}/index.html").is_file(), slug
        verify_feed(
            DIST / f"bookmarks/{slug}/index.xml", subset,
            SITE + f"/bookmarks/{slug}/",
        )
    assert sum(len([e for e in entries if e["id"].startswith(s + "/")]) for s in CATEGORIES.values()) == len(entries)
    print("Site-wide, bookmark and category RSS feeds match the complete bookmark manifest")


if __name__ == "__main__":
    main()
