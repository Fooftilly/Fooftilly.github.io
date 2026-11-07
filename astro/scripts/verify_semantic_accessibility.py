"""Validate semantic accessibility of every sitemap-listed static Astro page.

This is a deterministic build-time HTML check, not a substitute for keyboard
and screen-reader testing. Uses only the Python standard library.
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET


class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.language = None
        self.main_count = 0
        self.headings = 0
        self.ids = Counter()
        self.skip_to_main = False
        self.skip_link_text = []
        self.in_skip_link = False
        self.images_without_alt = 0
        self.unsafe_new_window_links = 0
        self.primary_nav_count = 0
        self.in_primary_nav = False
        self.primary_current_links = []
        self.in_footer_privacy = False
        self.footer_current_links = []

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == "html":
            self.language = props.get("lang")
        if tag == "nav" and props.get("aria-label") in {"Main navigation", "Glavna navigacija"}:
            self.primary_nav_count += 1
            self.in_primary_nav = True
        if tag == "p" and "footer-privacy" in props.get("class", "").split():
            self.in_footer_privacy = True
        if tag == "main":
            self.main_count += 1
        if tag == "h1":
            self.headings += 1
        if props.get("id"):
            self.ids[props["id"]] += 1
        if tag == "a":
            if "aria-current" in props and self.in_primary_nav:
                self.primary_current_links.append((props.get("href"), props["aria-current"]))
            if "aria-current" in props and self.in_footer_privacy:
                self.footer_current_links.append((props.get("href"), props["aria-current"]))
            if props.get("href") == "#main":
                self.skip_to_main = True
                self.in_skip_link = True
            if props.get("target", "").lower() == "_blank":
                rel = set((props.get("rel") or "").lower().split())
                if not {"noopener", "noreferrer"}.issubset(rel):
                    self.unsafe_new_window_links += 1
        if tag == "img" and "alt" not in props:
            self.images_without_alt += 1

    def handle_endtag(self, tag):
        if tag == "a":
            self.in_skip_link = False
        if tag == "nav" and self.in_primary_nav:
            self.in_primary_nav = False
        if tag == "p" and self.in_footer_privacy:
            self.in_footer_privacy = False

    def handle_data(self, data):
        if self.in_skip_link:
            self.skip_link_text.append(data)

    handle_startendtag = handle_starttag


def expected_nav_link(path: str):
    """Independently validate the current section for canonical published routes."""
    if path in {"/", "/sh/"}:
        return (path, "page")
    if path.startswith(("/sh/posts/", "/posts/")):
        href = "/sh/posts/" if path.startswith("/sh/") else "/posts/"
    elif path.startswith(("/bookmarks/", "/sh/bookmarks/")):
        href = "/bookmarks/"
    elif path.startswith(("/media/", "/films/", "/music/", "/tv/", "/new-media/")):
        href = "/media/"
    elif path.startswith(("/sh/projects/", "/projects/")):
        href = "/sh/projects/" if path.startswith("/sh/") else "/projects/"
    elif path.startswith(("/sh/search/", "/search/")):
        href = "/sh/search/" if path.startswith("/sh/") else "/search/"
    elif path == "/new-bookmark/":
        href = "/new-bookmark/"
    elif path.startswith(("/sh/about/", "/about/")):
        href = "/sh/about/" if path.startswith("/sh/") else "/about/"
    else:
        return None
    return (href, "page" if path == href else "location")


def verify_semantic_structure(dist: Path) -> None:
    dist = dist.resolve()
    sitemap = ET.parse(dist / "sitemap.xml").getroot()
    ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
    links = [node.text for node in sitemap.findall(f"{ns}url/{ns}loc")]
    assert links, "Sitemap has no pages to audit"
    # The special GitHub Pages error document is not a canonical sitemap route.
    if (dist / "404.html").is_file():
        links.append("https://www.peroniko.xyz/404.html")
    checked = 0
    for url in links:
        parsed = urlsplit(url or "")
        assert parsed.scheme == "https" and parsed.netloc == "www.peroniko.xyz", url
        assert (parsed.path.endswith("/") or parsed.path == "/404.html") and not parsed.query and not parsed.fragment, url
        # URL paths may percent-encode non-ASCII slugs; Astro writes Unicode paths.
        # Resolve after decoding so any encoded traversal is still rejected.
        path = ((dist / "404.html") if parsed.path == "/404.html"
                else (dist / unquote(parsed.path).lstrip("/") / "index.html")).resolve()
        assert path.is_relative_to(dist), f"Page escaped public build: {url}"
        assert path.is_file(), f"Missing HTML route from sitemap: {url}"
        structure = Structure()
        structure.feed(path.read_text(encoding="utf-8"))
        errors = []
        if structure.language not in {"en", "sh"}:
            errors.append(f"missing or unsupported language {structure.language!r}")
        if structure.main_count != 1 or structure.ids["main"] != 1:
            errors.append("expected one main landmark with id=main")
        if structure.headings != 1:
            errors.append(f"expected one h1, got {structure.headings}")
        if not structure.skip_to_main:
            errors.append("missing skip-to-main navigation")
        expected_skip = "Preskoči na sadržaj" if structure.language == "sh" else "Skip to content"
        if " ".join(" ".join(structure.skip_link_text).split()) != expected_skip:
            errors.append(f"skip-link label does not match page language: {structure.skip_link_text}")
        if structure.images_without_alt:
            errors.append(f"{structure.images_without_alt} images lack alt attributes")
        if structure.unsafe_new_window_links:
            errors.append(f"{structure.unsafe_new_window_links} new-window links lack noopener noreferrer")
        if structure.primary_nav_count != 1:
            errors.append(f"expected one primary navigation, got {structure.primary_nav_count}")
        expected_nav = expected_nav_link(parsed.path)
        actual_nav = structure.primary_current_links
        if actual_nav != ([expected_nav] if expected_nav else []):
            errors.append(f"primary navigation current link: expected {expected_nav!r}, got {actual_nav!r}")
        expected_privacy = (parsed.path, "page") if parsed.path in {"/privacy/", "/sh/privacy/"} else None
        if structure.footer_current_links != ([expected_privacy] if expected_privacy else []):
            errors.append(f"privacy navigation current link: expected {expected_privacy!r}, got {structure.footer_current_links!r}")
        repeated = sorted(key for key, count in structure.ids.items() if count > 1)
        if repeated:
            errors.append(f"duplicate ids: {', '.join(repeated[:10])}")
        assert not errors, f"Accessibility structure on {parsed.path}: {'; '.join(errors)}"
        checked += 1
    print(f"Validated semantic landmarks, headings, active navigation, skip links, images and external links on {checked} pages")
