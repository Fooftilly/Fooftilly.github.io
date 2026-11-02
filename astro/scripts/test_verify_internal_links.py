"""Unit tests for the static internal-link audit, with no Astro build required."""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote
from xml.etree import ElementTree as ET
import unittest

from verify_internal_links import audit_internal_links

ORIGIN = "https://www.peroniko.xyz"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


class InternalLinksTest(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.dist = Path(self.temp.name)

    def site(self, routes):
        root = ET.Element(f"{{{NS}}}urlset")
        for urlpath, html in routes.items():
            doc = self.dist / urlpath.lstrip("/") / "index.html"
            doc.parent.mkdir(parents=True, exist_ok=True)
            doc.write_text(html, encoding="utf-8")
            item = ET.SubElement(root, f"{{{NS}}}url")
            ET.SubElement(item, f"{{{NS}}}loc").text = ORIGIN + urlpath
        ET.ElementTree(root).write(self.dist / "sitemap.xml", encoding="utf-8")

    def test_valid_internal_links_anchors_queries_and_external_links(self):
        self.site({
            "/": '<main id="main"><a href="#main">Skip</a>'
                 '<a href="/other/?q=test#section">Other</a>'
                 '<a href="https://external.example/page">External</a>'
                 '<a href="mailto:test@example.org">Email</a></main>',
            "/other/": '<main id="section"><a href="/">Home</a></main>',
        })
        audit_internal_links(self.dist)

    def test_relative_sibling_routes(self):
        self.site({
            "/": '<a href="/nested/entry/">Entry</a>',
            "/nested/entry/": '<a href="../sibling/#section">Sibling</a>',
            "/nested/sibling/": '<main id="section"></main>',
        })
        audit_internal_links(self.dist)

    def test_same_origin_http_case_and_port_variants_are_rejected(self):
        for href in (
            "http://WWW.PERONIKO.XYZ/",
            "http://www.peroniko.xyz:80/",
            "https://WWW.PERONIKO.XYZ:8443/",
            "https://user@www.peroniko.xyz/",
        ):
            with self.subTest(href=href):
                self.site({"/": f'<a href="{href}">Unsafe</a>'})
                with self.assertRaisesRegex(AssertionError, "Insecure internal link"):
                    audit_internal_links(self.dist)

    def test_percent_encoded_unicode_routes(self):
        slug = "историја"
        self.site({
            "/": f'<a href="/{quote(slug)}/">Read</a>',
            f"/{slug}/": '<main id="main"></main>',
        })
        audit_internal_links(self.dist)

    def test_missing_page_is_rejected(self):
        self.site({"/": '<a href="/missing/">Broken</a>'})
        with self.assertRaisesRegex(AssertionError, "Broken internal link"):
            audit_internal_links(self.dist)

    def test_missing_fragment_is_rejected(self):
        self.site({"/": '<a href="#absent">Broken</a><main id="main"></main>'})
        with self.assertRaisesRegex(AssertionError, "Broken anchor"):
            audit_internal_links(self.dist)

    def test_unsafe_protocol_is_rejected(self):
        self.site({"/": '<a href="javascript:alert(1)">Unsafe</a>'})
        with self.assertRaisesRegex(AssertionError, "Unsafe link scheme"):
            audit_internal_links(self.dist)

    def test_encoded_path_escape_is_rejected(self):
        self.site({"/": '<a href="/%2e%2e/secret">Escape</a>'})
        with self.assertRaisesRegex(AssertionError, "escaped static output"):
            audit_internal_links(self.dist)


if __name__ == "__main__":
    unittest.main()
