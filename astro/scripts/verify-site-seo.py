"""Check static asset parity, SEO metadata and full generated sitemap before cutover.

Uses only the Python standard library. No network or deployment permissions.
"""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

from verify_semantic_accessibility import verify_semantic_structure
from verify_internal_links import audit_internal_links

ASTRO = Path(__file__).resolve().parents[1]
DIST = ASTRO / "dist"
STATIC = ASTRO.parent / "static"
SITE = "https://www.peroniko.xyz"
SECTIONS = ("art", "fun", "music", "paperbookarticle", "perspectives", "resource", "youtube")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Metadata(HTMLParser):
    def __init__(self):
        super().__init__()
        self.html_lang = ""
        self.metas = {}
        self.links = []

    def handle_starttag(self, tag, attrs):
        att = dict(attrs)
        if tag == "html":
            self.html_lang = att.get("lang", "")
        if tag == "meta":
            self.metas[att.get("property") or att.get("name")] = att.get("content")
        if tag == "link":
            self.links.append(att)


def check_assets():
    sources = sorted(p for p in STATIC.rglob("*") if p.is_file())
    assert sources, "Missing legacy static assets"
    for src in sources:
        relative = src.relative_to(STATIC)
        dst = DIST / relative
        assert dst.is_file(), f"Missing copied asset {relative}"
        assert sha256(src) == sha256(dst), f"Altered copied asset {relative}"
    assert (DIST / "CNAME").read_text().strip() == "www.peroniko.xyz"
    robots = (DIST / "robots.txt").read_text()
    assert "Sitemap: https://www.peroniko.xyz/sitemap.xml" in robots
    assert (DIST / "BingSiteAuth.xml").is_file()
    json.loads((DIST / "site.webmanifest").read_text())
    print(f"Validated {len(sources)} static assets, domain, robots and site manifest")


def check_sitemap():
    records = json.loads((ASTRO / ".audit/bookmarks-parity.json").read_text())
    assert len(records) == 576, "Expected full bookmark parity manifest"
    expected = {SITE + "/", SITE + "/about/", SITE + "/sr/", SITE + "/sr/about/", SITE + "/posts/", SITE + "/sr/posts/", SITE + "/search/", SITE + "/sr/search/", SITE + "/bookmarks/", SITE + "/new-bookmark/"}
    expected.update(f"{SITE}/bookmarks/{section}/" for section in SECTIONS)
    for record in records:
        section, stem = record["id"].split("/")
        expected.add(f"{SITE}/bookmarks/{section.lower()}/{quote(stem.lower(), safe='-._~')}/")
    assert len(expected) == 593, "Expected 10 root pages + 7 categories + 576 details"

    root = ET.parse(DIST / "sitemap.xml").getroot()
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    assert root.tag == f"{ns}urlset", root.tag
    locs = [node.text for node in root.findall(f"{ns}url/{ns}loc")]
    assert len(locs) == len(expected), "Duplicated sitemap URL or omitted record"
    assert set(locs) == expected, f"Sitemap mismatch: extra {set(locs)-expected}, missing {expected-set(locs)}"
    for link in locs:
        assert link and link.startswith(SITE + "/"), link
    assert not (DIST / "migration-audit").exists(), "Private audit data leaked into public output"
    assert (ASTRO / ".audit/bookmarks-parity.json").is_file(), "CI-only audit manifest missing"
    print(f"Validated sitemap: {len(locs)} unique canonical URLs; no public audit artifacts")


def check_metadata():
    pages = {
        "/": DIST / "index.html",
        "/about/": DIST / "about/index.html",
        "/sr/": DIST / "sr/index.html",
        "/sr/about/": DIST / "sr/about/index.html",
        "/posts/": DIST / "posts/index.html",
        "/sr/posts/": DIST / "sr/posts/index.html",
        "/search/": DIST / "search/index.html",
        "/sr/search/": DIST / "sr/search/index.html",
        "/bookmarks/": DIST / "bookmarks/index.html",
        "/new-bookmark/": DIST / "new-bookmark/index.html",
        "/bookmarks/art/": DIST / "bookmarks/art/index.html",
        "/bookmarks/art/50_watts___illustrations___/": DIST / "bookmarks/art/50_watts___illustrations___/index.html",
    }
    for urlpath, filename in pages.items():
        doc = Metadata()
        doc.feed(filename.read_text(encoding="utf8"))
        expected = SITE + urlpath
        assert doc.html_lang == ("sr-Latn" if urlpath.startswith("/sr/") else "en"), (urlpath, doc.html_lang)
        assert doc.metas.get("description"), urlpath
        assert doc.metas.get("author") == "Nikola Perović", urlpath
        assert doc.metas.get("og:url") == expected, urlpath
        assert doc.metas.get("og:image") == SITE + "/avatar-full.webp", urlpath
        assert doc.metas.get("twitter:card") == "summary", urlpath
        assert any(link.get("rel") == "canonical" and link.get("href") == expected for link in doc.links), urlpath
        for needed in ("/favicon.svg", "/site.webmanifest"):
            assert any(link.get("href") == needed for link in doc.links), (urlpath, needed)
        if urlpath in ("/", "/sr/", "/posts/", "/sr/posts/"):
            assert any(
                link.get("rel") == "alternate"
                and link.get("type") == "application/rss+xml"
                and link.get("href") == "/index.xml"
                for link in doc.links
            ), ("Missing site-wide RSS discovery", urlpath)
    print(f"Validated SEO and social metadata on {len(pages)} representative pages")


def check_opt_in_comments():
    page = DIST / "bookmarks/art/50_watts___illustrations___/index.html"
    html = page.read_text(encoding="utf8")
    assert "data-comments-consent" in html, "Missing opt-in comment section"
    assert "data-load-comments" in html and "Load comments from Giscus" in html, "Missing consent control"
    assert 'src="https://giscus.app/client.js"' not in html, "Giscus may not load automatically"
    print("Verified bookmark comments require visitor opt-in before loading third-party scripts")


if __name__ == "__main__":
    check_assets()
    check_sitemap()
    check_metadata()
    verify_semantic_structure(DIST)
    audit_internal_links(DIST)
    check_opt_in_comments()
