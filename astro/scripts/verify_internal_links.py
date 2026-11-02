"""Verify navigation targets in the generated Astro site without network access.

External HTTP(S), mailto and tel links are intentionally not fetched.
All same-origin anchors must refer to generated files and valid HTML IDs.
"""
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
from xml.etree import ElementTree as ET

HOST = "www.peroniko.xyz"
ORIGIN = "https://" + HOST


class Anchors(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if props.get("id"):
            self.ids.add(props["id"])
        if tag == "a" and "href" in props:
            self.hrefs.append(props["href"])

    handle_startendtag = handle_starttag


def audit_internal_links(dist: Path) -> None:
    dist = dist.resolve()
    sitemap = ET.parse(dist / "sitemap.xml").getroot()
    namespace = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    pages = [loc.text for loc in sitemap.findall(f"{namespace}url/{namespace}loc")]
    assert pages, "No sitemap pages to inspect"

    @lru_cache(maxsize=None)
    def parse_html(path: Path) -> Anchors:
        parsed = Anchors()
        parsed.feed(path.read_text(encoding="utf-8"))
        return parsed

    checked = 0
    for page_url in pages:
        source = urlsplit(page_url or "")
        assert source.scheme == "https" and source.netloc == HOST, page_url
        assert source.path.endswith("/"), page_url
        source_path = (dist / unquote(source.path).lstrip("/") / "index.html").resolve()
        assert source_path.is_relative_to(dist) and source_path.is_file(), page_url

        for href in parse_html(source_path).hrefs:
            raw = href.strip()
            if not raw:
                continue
            resolved = urlsplit(urljoin(page_url, raw))
            if resolved.scheme not in {"http", "https", "mailto", "tel"}:
                raise AssertionError(f"Unsafe link scheme on {source.path}: {href}")
            if resolved.scheme in {"mailto", "tel"} or resolved.netloc != HOST:
                continue
            if resolved.scheme != "https":
                raise AssertionError(f"Insecure internal link on {source.path}: {href}")

            path = unquote(resolved.path)
            if path.endswith("/") or not Path(path).suffix:
                path = path.rstrip("/") + "/index.html"
            target = (dist / path.lstrip("/")).resolve()
            if not target.is_relative_to(dist):
                raise AssertionError(f"Internal link escaped static output on {source.path}: {href}")
            if not target.is_file():
                raise AssertionError(f"Broken internal link on {source.path}: {href} -> {path}")
            if resolved.fragment and target.suffix == ".html":
                fragment = unquote(resolved.fragment)
                # Text fragments are browser-driven and do not refer to an HTML id.
                if not fragment.startswith(":~:text=") and fragment not in parse_html(target).ids:
                    raise AssertionError(f"Broken anchor on {source.path}: {href} -> #{fragment}")
            checked += 1

    print(f"Verified {checked} internal navigation targets across {len(pages)} generated pages")
