"""Verify English/Serbian About pages preserve original Markdown content and SEO.

Uses only Python standard library. No external requests or site publication.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CONTENT = ROOT.parent / "content"

class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lang = ""
        self.links = []
        self.anchors = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "html":
            self.lang = data.get("lang", "")
        if tag == "link":
            self.links.append(data)
        if tag == "a":
            self.anchors.append(data)

    def handle_data(self, value):
        self.parts.append(value)

def shortcode(source):
    hits = re.findall(
        r'\{\{<\s*cloakemail\s+address="([^"]+)"\s+display="([^"]+)"\s+query="([^"]+)"\s*>\}\}',
        source,
    )
    assert len(hits) == 1, "Each About Markdown must have exactly one contact shortcode"
    return hits[0]

def validate(lang, source, html_file, alternate):
    raw = source.read_text(encoding="utf8")
    html = html_file.read_text(encoding="utf8")
    doc = Document()
    doc.feed(html)
    expected_lang = "sr-Latn" if lang == "sr" else "en"
    assert doc.lang == expected_lang, doc.lang
    assert "{{<" not in html and "cloakemail" not in html, "Raw Hugo shortcode leaked to Astro"
    assert "Creative Commons Attribution-ShareAlike 4.0 International License" in html, source
    assert "Github Repo" in html, source
    visible_text = " ".join(part.strip() for part in doc.parts if part.strip())
    expected_intro = "Moj lični sajt." if lang == "sr" else "My personal website. Made by me."
    assert expected_intro in visible_text, (
        f"Missing localized original introduction: {expected_intro!r}; "
        f"rendered text sample: {visible_text[:900]!r}"
    )
    assert any(item.get("rel") == "alternate" and item.get("hreflang") == ("en" if lang == "sr" else "sr-Latn") and item.get("href") == alternate for item in doc.links), "Missing cross-language alternate"

    email, label, query = shortcode(raw)
    mailto = [a.get("href") for a in doc.anchors if a.get("href", "").startswith("mailto:")]
    assert len(mailto) == 1, f"Expected one translated contact link, found {len(mailto)}"
    parsed = urlparse(mailto[0])
    assert parsed.scheme == "mailto" and parsed.path == email
    assert parse_qs(parsed.query) == parse_qs(query)
    assert label in "".join(doc.parts), "Contact link label not translated"
    print(f"Validated {source.name} rendered from original content ({expected_lang}, contact and hreflang)")

def main():
    validate("en", CONTENT / "about.md", DIST / "about/index.html", "https://www.peroniko.xyz/sr/about/")
    validate("sr", CONTENT / "about.sr.md", DIST / "sr/about/index.html", "https://www.peroniko.xyz/about/")
    assert (DIST / "sr/index.html").is_file(), "Missing Serbian homepage"

if __name__ == "__main__":
    main()
