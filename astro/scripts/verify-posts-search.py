"""Verify migrated posts/search routes against original localized Hugo page metadata.

This intentionally asserts that the legacy posts directory currently contains no
individual articles. A future post must ship with its own detail-page renderer,
not silently appear in an archive that cannot link to it.
"""
from html.parser import HTMLParser
from pathlib import Path
import os
from urllib.parse import urlparse
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
CONTENT = ROOT.parent / "content"
ORIGIN = "https://www.peroniko.xyz"

class HtmlAudit(HTMLParser):
    def __init__(self):
        super().__init__()
        self.language = None
        self.heading = []
        self.links = []
        self.metadata = []
        self.text = []
        self.in_heading = False
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "html":
            self.language = data.get("lang")
        elif tag == "h1":
            self.in_heading = True
        elif tag == "link":
            self.metadata.append(data)
        elif tag == "a":
            self.links.append(data)
        elif tag in {"style", "script"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag == "h1":
            self.in_heading = False
        elif tag in {"style", "script"}:
            self.hidden -= 1

    def handle_data(self, value):
        if self.hidden == 0:
            self.text.append(value)
            if self.in_heading:
                self.heading.append(value)

def frontmatter_title(path):
    text = path.read_text(encoding="utf8")
    assert text.startswith("---"), path
    match = re.search(r'^title:\s*["\x27]?([^"\x27\r\n]+)', text, re.MULTILINE)
    assert match, path
    return match.group(1).strip()

def load_page(relative):
    page = DIST / relative / "index.html"
    assert page.is_file(), page
    html = page.read_text(encoding="utf8")
    data = HtmlAudit()
    data.feed(html)
    return html, data

def check_pages():
    posts_root = CONTENT / "posts"
    articles = [item for item in posts_root.rglob("*.md") if item.name != "_index.md"]
    assert not articles, (
        "Post Markdown appeared without a tested individual post renderer: " +
        ", ".join(str(item) for item in articles)
    )
    sources = {
        "posts": ("posts.md", "en", "/sr/posts/", False),
        "sr/posts": ("posts.sr.md", "sr-Latn", "/posts/", False),
        "search": ("search.md", "en", "/sr/search/", True),
        "sr/search": ("search.sr.md", "sr-Latn", "/search/", True),
    }
    for route, (source, language, alternate, is_search) in sources.items():
        html, page = load_page(route)
        heading = " ".join(page.heading).strip()
        assert heading == frontmatter_title(CONTENT / source), (
            "Original Hugo page title lost", route, heading
        )
        assert page.language == language, (route, page.language)
        expected = f"{ORIGIN}/{route}/"
        assert any(x.get("rel") == "canonical" and x.get("href") == expected for x in page.metadata), route
        assert any(x.get("rel") == "alternate" and x.get("href") == ORIGIN + alternate for x in page.metadata), route
        assert any(link.get("href") == "/bookmarks/" for link in page.links), route
        if is_search:
            assert "astro-island" in html, ("Missing hydrated search browser", route)
            assert "50 Watts" in html and "2048 by Gabriele Cirulli" in html, ("Missing bookmark search data", route)
            assert ("Pretraži linkove" if route.startswith("sr/") else "Search links") in html, ("Search not localized", route)
        else:
            expected_empty = "Trenutno nema objavljenih tekstova" if route.startswith("sr/") else "There are no published posts yet"
            assert expected_empty in html, ("Missing truthful empty archive", route)
        print(f"Verified /{route}/ from {source}, locale {language}")

    legacy = os.environ.get("LEGACY_HUGO_SITE_DIR")
    if not legacy:
        raise RuntimeError("Compiled Hugo baseline is required to verify route parity")
    for route in ("posts", "sr/posts", "search", "sr/search", "en/posts"):
        path = Path(legacy) / route / "index.html"
        assert path.is_file(), f"Legacy Hugo did not generate the expected route: {route}"
    print("All five Astro page/alias URLs exist in the compiled legacy Hugo output")

    redirect, _ = load_page("en/posts")
    assert 'http-equiv="refresh"' in redirect and '0;url=/posts/' in redirect, "Legacy Hugo archive alias missing"
    assert 'content="noindex"' in redirect and ORIGIN + "/posts/" in redirect, "Alias must be canonicalized and excluded from index"

if __name__ == "__main__":
    check_pages()
