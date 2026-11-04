"""Verify English/Serbo-Croatian About pages preserve original Markdown content and SEO.

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
        self.embeds = []
        self.non_text_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.non_text_depth += 1
        if tag in ("iframe", "embed", "object"):
            self.embeds.append(tag)
        data = dict(attrs)
        if tag == "html":
            self.lang = data.get("lang", "")
        if tag == "link":
            self.links.append(data)
        if tag == "a":
            self.anchors.append(data)

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.non_text_depth -= 1

    def handle_data(self, value):
        if self.non_text_depth == 0:
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
    expected_lang = "sh" if lang == "sh" else "en"
    assert doc.lang == expected_lang, doc.lang
    assert "{{<" not in html and "cloakemail" not in html, "Raw Hugo shortcode leaked to Astro"
    assert "Creative Commons Attribution-ShareAlike 4.0 International License" in html, source
    assert "Github Repo" in html, source
    visible_text = " ".join(part.strip() for part in doc.parts if part.strip())
    assert "Astro" in visible_text and "Vue" in visible_text, source
    assert "Hugo" not in visible_text and "PaperMod" not in visible_text, source
    assert "img.shields.io" not in html, "Remote license badge was not removed"
    assert not doc.embeds, f"Unexpected embedded content: {doc.embeds}"
    expected_intro = "Moj lični sajt." if lang == "sh" else "My personal website. Made by me."
    assert expected_intro in visible_text, (
        f"Missing localized original introduction: {expected_intro!r}; "
        f"rendered text sample: {visible_text[:900]!r}"
    )
    assert any(item.get("rel") == "alternate" and item.get("hreflang") == ("en" if lang == "sh" else "sh") and item.get("href") == alternate for item in doc.links), "Missing cross-language alternate"

    email, label, query = shortcode(raw)
    mailto = [a.get("href") for a in doc.anchors if a.get("href", "").startswith("mailto:")]
    assert len(mailto) == 1, f"Expected one translated contact link, found {len(mailto)}"
    parsed = urlparse(mailto[0])
    assert parsed.scheme == "mailto" and parsed.path == email
    assert parse_qs(parsed.query) == parse_qs(query)
    assert label in "".join(doc.parts), "Contact link label not translated"
    print(f"Validated {source.name} rendered from original content ({expected_lang}, contact and hreflang)")

def main():
    sample = Document()
    sample.feed('<iframe src="https://example.test"></iframe><embed src="https://example.test"><object data="https://example.test"></object>')
    assert sample.embeds == ["iframe", "embed", "object"], "Embedded-element detection regressed"
    validate("en", CONTENT / "about.md", DIST / "about/index.html", "https://www.peroniko.xyz/sh/about/")
    validate("sh", CONTENT / "about.sh.md", DIST / "sh/about/index.html", "https://www.peroniko.xyz/about/")
    assert (DIST / "sh/index.html").is_file(), "Missing Serbo-Croatian homepage"

if __name__ == "__main__":
    main()
