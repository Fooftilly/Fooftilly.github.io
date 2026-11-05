"""Check static asset parity, SEO metadata and full generated sitemap before cutover.

Uses only the Python standard library. No network or deployment permissions.
"""
import hashlib
import json
import re
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
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        att = dict(attrs)
        if tag == "html":
            self.html_lang = att.get("lang", "")
        if tag == "meta":
            self.metas[att.get("property") or att.get("name")] = att.get("content")
        if tag == "link":
            self.links.append(att)
        if tag == "a":
            self.anchors.append(att)


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
    expected = {SITE + "/", SITE + "/about/", SITE + "/sh/", SITE + "/sh/about/", SITE + "/posts/", SITE + "/sh/posts/", SITE + "/search/", SITE + "/sh/search/", SITE + "/bookmarks/", SITE + "/new-bookmark/", SITE + "/media/", SITE + "/music/", SITE + "/films/", SITE + "/tv/", SITE + "/new-media/", SITE + "/privacy/", SITE + "/sh/privacy/"}
    project_sources = sorted((ASTRO.parent / "content/projects").glob("*.md"))
    slugs = {src.stem for src in project_sources}
    assert {"prks", "kokoro-extension", "local-search-mcp"}.issubset(slugs), (
        "Initial showcase projects are missing", slugs
    )
    assert len(project_sources) == len(slugs), "Duplicate project IDs"
    assert all(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) for slug in slugs)
    expected.add(SITE + "/projects/")
    expected.update(f"{SITE}/projects/{slug}/" for slug in slugs)
    expected.update(f"{SITE}/bookmarks/{section}/" for section in SECTIONS)
    for record in records:
        section, stem = record["id"].split("/")
        expected.add(f"{SITE}/bookmarks/{section.lower()}/{quote(stem.lower(), safe='-._~')}/")
    assert len(expected) == 601 + len(slugs), "Expected 18 roots + 7 categories + 576 bookmarks + project routes"

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
        "/sh/": DIST / "sh/index.html",
        "/sh/about/": DIST / "sh/about/index.html",
        "/posts/": DIST / "posts/index.html",
        "/sh/posts/": DIST / "sh/posts/index.html",
        "/search/": DIST / "search/index.html",
        "/sh/search/": DIST / "sh/search/index.html",
        "/bookmarks/": DIST / "bookmarks/index.html",
        "/new-bookmark/": DIST / "new-bookmark/index.html",
        "/music/": DIST / "music/index.html",
        "/films/": DIST / "films/index.html",
        "/tv/": DIST / "tv/index.html",
        "/media/": DIST / "media/index.html",
        "/new-media/": DIST / "new-media/index.html",
        "/projects/": DIST / "projects/index.html",
        "/projects/prks/": DIST / "projects/prks/index.html",
        "/projects/kokoro-extension/": DIST / "projects/kokoro-extension/index.html",
        "/projects/local-search-mcp/": DIST / "projects/local-search-mcp/index.html",
        "/privacy/": DIST / "privacy/index.html",
        "/sh/privacy/": DIST / "sh/privacy/index.html",
        "/bookmarks/art/": DIST / "bookmarks/art/index.html",
        "/bookmarks/art/50_watts___illustrations___/": DIST / "bookmarks/art/50_watts___illustrations___/index.html",
    }
    for urlpath, filename in pages.items():
        doc = Metadata()
        doc.feed(filename.read_text(encoding="utf8"))
        expected = SITE + urlpath
        assert doc.html_lang == ("sh" if urlpath.startswith("/sh/") else "en"), (urlpath, doc.html_lang)
        assert doc.metas.get("description"), urlpath
        assert doc.metas.get("author") == "Peroniko", urlpath
        assert doc.metas.get("og:site_name") == "Peroniko", urlpath
        markup = filename.read_text(encoding="utf8")
        assert "· Peroniko</title>" in markup, ("Old page title branding", urlpath)
        assert '>Peroniko</a>' in markup, ("Old navigation branding", urlpath)
        assert doc.metas.get("og:url") == expected, urlpath
        assert doc.metas.get("og:image") == SITE + "/avatar-full.webp", urlpath
        assert doc.metas.get("twitter:card") == "summary", urlpath
        assert any(link.get("rel") == "canonical" and link.get("href") == expected for link in doc.links), urlpath
        # Require short language labels and matching BCP-47 metadata on all
        # paired public pages, not just the homepage.
        alternate_routes = {
            "/": ("/sh/", "SH", "sh"),
            "/sh/": ("/", "EN", "en"),
            "/about/": ("/sh/about/", "SH", "sh"),
            "/sh/about/": ("/about/", "EN", "en"),
            "/posts/": ("/sh/posts/", "SH", "sh"),
            "/sh/posts/": ("/posts/", "EN", "en"),
            "/search/": ("/sh/search/", "SH", "sh"),
            "/sh/search/": ("/search/", "EN", "en"),
            "/privacy/": ("/sh/privacy/", "SH", "sh"),
            "/sh/privacy/": ("/privacy/", "EN", "en"),
        }
        if urlpath in alternate_routes:
            target, label, locale = alternate_routes[urlpath]
            markup = filename.read_text(encoding="utf8")
            pattern = (r'<a\b(?=[^>]*href="' + re.escape(target)
                       + r'")(?=[^>]*hreflang="' + locale
                       + r'")[^>]*>\s*' + label + r'\s*</a>')
            assert re.search(pattern, markup), ("Missing SH/EN language switch", urlpath)
            assert 'href="/sr/' not in markup and 'hreflang="sr' not in markup, (
                "Old locale leaked into public markup", urlpath
            )
        for needed in ("/favicon.svg", "/site.webmanifest"):
            assert any(link.get("href") == needed for link in doc.links), (urlpath, needed)
        if urlpath in ("/", "/sh/", "/posts/", "/sh/posts/"):
            assert any(
                link.get("rel") == "alternate"
                and link.get("type") == "application/rss+xml"
                and link.get("href") == "/index.xml"
                for link in doc.links
            ), ("Missing site-wide RSS discovery", urlpath)
        if urlpath in ("/", "/sh/"):
            profile_urls = {
                "https://github.com/Fooftilly",
                "https://bsky.app/profile/peroniko.xyz",
                "https://letterboxd.com/Peroniko",
                "https://trakt.tv/users/cobe10",
                "https://rateyourmusic.com/~Fooftilly",
                "https://old.reddit.com/r/Peroniko/",
                "/index.xml",
            }
            actual = {item.get("href") for item in doc.anchors}
            assert profile_urls.issubset(actual), ("Missing social or RSS profile links", urlpath, profile_urls - actual)
    print(f"Validated SEO and social metadata on {len(pages)} representative pages")


def check_not_found_page():
    page = DIST / "404.html"
    assert page.is_file(), "Missing GitHub Pages static 404.html"
    html = page.read_text(encoding="utf8")
    doc = Metadata()
    doc.feed(html)
    assert doc.metas.get("robots") == "noindex, nofollow", "404 page must not be indexed"
    assert not any(link.get("rel") == "canonical" for link in doc.links), "404 must not claim a canonical page"
    assert doc.metas.get("og:url") is None, "404 must not advertise a canonical social URL"
    assert re.search(r"<h1\b[^>]*>\s*Page not found\s*</h1>", html), "404 page needs an explanatory heading"
    for path in ('href="/"', 'href="/bookmarks/"', 'href="/search/"', 'href="/sh/"'):
        assert path in html, f"Missing recovery navigation on 404: {path}"
    print("Validated non-indexable GitHub Pages 404.html with recovery navigation")


def check_opt_in_comments():
    page = DIST / "bookmarks/art/50_watts___illustrations___/index.html"
    html = page.read_text(encoding="utf8")
    assert "data-comments-consent" in html, "Missing opt-in comment section"
    assert "data-load-comments" in html and "Load comments from Giscus" in html, "Missing consent control"
    assert 'src="https://giscus.app/client.js"' not in html, "Giscus may not load automatically"
    print("Verified bookmark comments require visitor opt-in before loading third-party scripts")


def check_privacy_disclosure():
    """Ensure both localized privacy notices are reachable and match source behavior."""
    for path, other, language, markers in (
        ("/privacy/", "/sh/privacy/", "en",
         ("Privacy and cookies", "GitHub Pages", "Google Analytics", "Giscus",
          "localStorage", "unverified")),
        ("/sh/privacy/", "/privacy/", "sh",
         ("Privatnost i kolačići", "GitHub Pages", "Google Analytics", "Giscus",
          "localStorage", "nijesu provjerena")),
    ):
        source = ASTRO.parent / "content" / ("privacy.sh.md" if language == "sh" else "privacy.md")
        original = source.read_text(encoding="utf8")
        assert original.startswith('---\n') and 'translationKey: "privacy"' in original, source
        assert all(marker in original for marker in ("GitHub Pages", "Google Analytics", "Giscus")), source
        html = (DIST / path.lstrip("/") / "index.html").read_text(encoding="utf8")
        doc = Metadata()
        doc.feed(html)
        assert doc.html_lang == language, path
        for text in markers:
            assert text in html, (path, "Missing disclosure content", text)
        expected_alternate = SITE + other
        assert any(link.get("rel") == "alternate" and
                   link.get("href") == expected_alternate for link in doc.links), path
        assert any(a.get("href") == ("/sh/privacy/" if path == "/privacy/" else "/privacy/")
                   for a in doc.anchors), (path, "Missing language navigation")
        assert any(a.get("href") == "https://policies.google.com/privacy"
                   for a in doc.anchors), (path, "Missing Google policy reference")
        assert any(a.get("href") ==
                   "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
                   for a in doc.anchors), (path, "Missing GitHub privacy reference")
        assert 'src="https://www.googletagmanager.com/' not in html, path
        assert 'src="https://giscus.app/' not in html, path
    for page in (DIST / "index.html", DIST / "sh/index.html"):
        html = page.read_text(encoding="utf8")
        expected = "/sh/privacy/" if page.parts[-2] == "sh" else "/privacy/"
        assert f'href="{expected}"' in html, ("Missing visible footer privacy link", page)
    print("Verified bilingual privacy notice, provider references, footer navigation and opt-in loading")


def check_analytics_privacy():
    for page in (DIST / "index.html", DIST / "sh/index.html", DIST / "404.html"):
        html = page.read_text(encoding="utf8")
        for required in ("data-analytics-consent", "data-analytics-settings", "data-analytics-allow", "data-analytics-decline"):
            assert required in html, f"Missing analytics privacy control {required}: {page}"
        assert 'src="https://www.googletagmanager.com/' not in html, (
            f"GA must not preload before visitor consent: {page}"
        )
    print("Verified bilingual privacy controls and no eager Google tracking script")




if __name__ == "__main__":
    check_assets()
    check_sitemap()
    check_metadata()
    verify_semantic_structure(DIST)
    audit_internal_links(DIST)
    check_not_found_page()
    check_analytics_privacy()
    check_opt_in_comments()
    check_privacy_disclosure()
