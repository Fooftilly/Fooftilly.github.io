"""Fail a static build that eagerly contacts third parties through executable embeds.

Ordinary outbound links are fine: merely displaying a bookmark should not
fetch a video frame, remote script, or speculative connection. Consent-gated
Giscus/GA scripts are inserted only after a visitor choice, not in static HTML.
This audit does not inspect runtime JS or images; browser tests cover the
existing GA/Giscus opt-in behavior.
"""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit


EAGER_LINK_RELATIONS = {
    "stylesheet", "preconnect", "dns-prefetch", "preload", "modulepreload",
    "prefetch", "prerender",
}
RESOURCE_ATTRIBUTES = {
    "script": "src",
    "iframe": "src",
    "embed": "src",
    "object": "data",
}


def is_eager_external_target(raw: str, site: str) -> bool:
    """Recognize cross-origin network targets and suspicious executable schemes."""
    url = urlsplit(raw.strip())
    canonical = urlsplit(site)
    if not raw.strip():
        return False
    if url.scheme or url.netloc:
        return not (
            url.scheme == "https" and url.hostname == canonical.hostname
            and url.port in (None, 443) and not url.username
            and not url.password
        )
    # Relative URLs and fragment identifiers are same-origin; reject
    # malformed absolute-looking backslash paths that browsers may normalize.
    return raw.lstrip().startswith("\\")


class EagerResources(HTMLParser):
    """Inspect actual resource-fetching HTML attributes, not ordinary anchors."""

    def __init__(self, site: str):
        super().__init__(convert_charrefs=True)
        self.site = site
        self.violations: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        data = dict(attrs)
        if tag == "iframe" and "srcdoc" in data:
            # srcdoc can bootstrap remote resources without an external src.
            self.violations.append("iframe[srcdoc] (review embedded content)")
        attribute = RESOURCE_ATTRIBUTES.get(tag)
        if tag == "link":
            rel = set((data.get("rel") or "").lower().split())
            if not (rel & EAGER_LINK_RELATIONS):
                return
            attribute = "href"
        if attribute:
            target = data.get(attribute)
            if target is not None and is_eager_external_target(target, self.site):
                self.violations.append(f"{tag}[{attribute}]={target[:140]!r}")


def audit_static_resources(dist: Path, site: str) -> None:
    """Scan every generated page, not a fixed handful of representative routes."""
    pages = sorted(dist.rglob("*.html"))
    assert pages, "No generated HTML pages to inspect for third-party embeds"
    violations = []
    for page in pages:
        parser = EagerResources(site)
        parser.feed(page.read_text(encoding="utf-8"))
        parser.close()
        if parser.violations:
            violations.append((page.relative_to(dist).as_posix(), parser.violations[:5]))
    assert not violations, (
        "Eager third-party frames, scripts or connection hints in static HTML: "
        + repr(violations[:10])
    )
    print(f"Verified no eager third-party scripts/embeds/connection hints on {len(pages)} pages")


def self_test_static_resources(site: str) -> None:
    """Exercise safe and unsafe HTML fixtures stored separately from Python."""
    fixtures = Path(__file__).resolve().parent / "fixtures"
    safe = (fixtures / "third-party-safe.html").read_text(encoding="utf-8")
    parser = EagerResources(site)
    parser.feed(safe)
    parser.close()
    assert not parser.violations, parser.violations

    forbidden = (fixtures / "third-party-forbidden.html").read_text(encoding="utf-8")
    for line_number, html in enumerate(forbidden.splitlines(), 1):
        if not html.strip():
            continue
        check = EagerResources(site)
        check.feed(html)
        check.close()
        assert check.violations, (
            f"Eager resource escaped privacy audit in fixture line {line_number}: {html}"
        )
