"""Audit Astro's generated output for third-party resources loaded without a
visitor click. External navigation links are harmless until selected; embedded
resources and preconnect/prefetch directives can make immediate network requests.

This is a deterministic static check, not a runtime network interception or a
legal compliance determination. Dynamic script injection requires separate
reviews/browser checks (GA4 and Giscus are already opt-in).
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
import re

SITE_HOST = "www.peroniko.xyz"
AUTOFETCH = {
    "script": ("src",),
    "iframe": ("src",),
    "img": ("src", "srcset"),
    "source": ("src", "srcset"),
    "video": ("src", "poster"),
    "audio": ("src",),
    "track": ("src",),
    "embed": ("src",),
    "object": ("data",),
}
FETCHING_REL = {
    "preconnect", "dns-prefetch", "prefetch", "prerender",
    "preload", "modulepreload", "stylesheet", "icon",
}
REMOTE_CSS = re.compile(r"url\(\s*['\"]?(?:https?:)?//", re.IGNORECASE)
EXTERNAL_IMPORT = re.compile(r"@import\s+(?:url\(\s*)?['\"]?(?:https?:)?//", re.IGNORECASE)


def is_unapproved_resource(url: str) -> bool:
    value = url.strip()
    if not value:
        return False
    if value.lower().startswith(("data:", "javascript:", "vbscript:")):
        return True
    if value.startswith("//"):
        return True
    parsed = urlsplit(value)
    if parsed.scheme in ("http", "https"):
        return parsed.scheme != "https" or parsed.hostname != SITE_HOST
    # Only safe same-origin relative URLs are allowed as statically loaded resources.
    return bool(parsed.scheme)


def srcset_urls(value: str):
    # srcset entries are URL + optional descriptor; actual external URL
    # candidates are detected before the whitespace descriptor.
    return [part.strip().split()[0] for part in value.split(",") if part.strip()]


class ThirdPartyParser(HTMLParser):
    def __init__(self, origin: str = ""):
        super().__init__(convert_charrefs=True)
        self.origin = origin
        self.violations = []
        self.in_style = False

    def check(self, tag: str, attr: str, value: str):
        urls = srcset_urls(value) if attr == "srcset" else [value]
        for url in urls:
            if is_unapproved_resource(url):
                self.violations.append(f"{self.origin}: <{tag}> {attr} loads {url[:180]!r} without opt-in")

    def handle_starttag(self, tag, attrs):
        params = dict(attrs)
        if tag == "style":
            self.in_style = True
        for field in AUTOFETCH.get(tag, ()):
            if params.get(field):
                self.check(tag, field, params[field])
        if tag == "link":
            rel = set((params.get("rel") or "").lower().split())
            if rel.intersection(FETCHING_REL) and params.get("href"):
                self.check(tag, "href", params["href"])
        if tag == "iframe" and params.get("srcdoc"):
            nested = ThirdPartyParser(self.origin + " iframe-srcdoc")
            nested.feed(params["srcdoc"])
            self.violations.extend(nested.violations)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "style":
            self.in_style = False

    def handle_data(self, data):
        if self.in_style and (REMOTE_CSS.search(data) or EXTERNAL_IMPORT.search(data)):
            self.violations.append(f"{self.origin}: inline CSS includes an external resource")


def audit_public_output(dist: Path):
    if not dist.is_dir():
        raise AssertionError(f"Missing Astro public directory: {dist}")
    violations = []
    pages = list(dist.rglob("*.html"))
    if not pages:
        raise AssertionError("No generated Astro HTML pages to check")
    for path in pages:
        relative = path.relative_to(dist)
        parser = ThirdPartyParser(str(relative))
        parser.feed(path.read_text(encoding="utf-8"))
        violations.extend(parser.violations)
    for path in dist.rglob("*.css"):
        data = path.read_text(encoding="utf-8")
        if REMOTE_CSS.search(data) or EXTERNAL_IMPORT.search(data):
            violations.append(f"{path.relative_to(dist)}: CSS requests an external resource before opt-in")
    if violations:
        raise AssertionError("Automatic third-party resource loads are prohibited:\n" +
                             "\n".join(violations[:25]))
    return len(pages)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    count = audit_public_output(root / "dist")
    print(f"Checked {count} generated HTML pages and CSS: no pre-consent external resource loads")
