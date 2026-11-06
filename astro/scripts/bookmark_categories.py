"""Read the same bookmark category catalog used by Astro and the Node audits."""
import json
import re
from pathlib import Path

ASTRO = Path(__file__).resolve().parents[1]
SOURCE = ASTRO.parent / "content/bookmarks"
CATALOG = ASTRO / "src/data/bookmark-categories.json"


def load_categories():
    categories = json.loads(CATALOG.read_text(encoding="utf-8"))
    assert isinstance(categories, list) and categories, "Bookmark category catalog is empty"
    sections = set()
    slugs = set()
    default_count = 0
    for category in categories:
        assert isinstance(category, dict), "Invalid category object"
        section, slug = category.get("section"), category.get("slug")
        assert isinstance(section, str) and re.fullmatch(r"[A-Za-z][A-Za-z0-9]*", section), section
        assert isinstance(slug, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug), slug
        assert all(isinstance(category.get(key), str) and category[key].strip()
                   for key in ("label", "labelSh")), category
        assert section not in sections and slug not in slugs, "Duplicate bookmark category"
        sections.add(section)
        slugs.add(slug)
        default_count += category.get("default") is True
    assert default_count == 1, "Expected exactly one default bookmark category"
    folders = {path.name for path in SOURCE.iterdir() if path.is_dir()}
    assert folders == sections, ("Bookmark folders/catalog mismatch", folders ^ sections)
    return categories
