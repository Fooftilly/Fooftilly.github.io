"""Regression tests for source-linked project cards (no Astro build required)."""
from html import escape
from pathlib import Path
from string import Template
import unittest

from verify_projects import (
    parse_project_cards,
    parse_project_heading,
    verify_card_source_link,
    verify_project_disclosures,
    verify_project_license_link,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
CARD = Template((FIXTURES / "project-card.html").read_text(encoding="utf-8"))
DETAIL = Template((FIXTURES / "project-detail.html").read_text(encoding="utf-8"))
DISCLOSURES = Template((FIXTURES / "project-disclosures.html").read_text(encoding="utf-8"))
LICENSE = Template((FIXTURES / "project-license.html").read_text(encoding="utf-8"))


def card(slug, title, repository, label="Source code", accessible_name=None):
    if accessible_name is None:
        accessible_name = f"{label}: {title}"
    return CARD.substitute(
        slug=escape(slug, quote=True),
        title=escape(title),
        repository=escape(repository, quote=True),
        accessible_name=escape(accessible_name, quote=True),
        label=escape(label),
    )


def detail_heading(title):
    return parse_project_heading(DETAIL.substitute(title=escape(title)))


def cards(*items):
    return parse_project_cards("".join(items))



def license_markup(url, identifier, rel="noopener noreferrer"):
    return LICENSE.substitute(
        url=escape(url, quote=True),
        license=escape(identifier),
        rel=escape(rel, quote=True),
    )

class ProjectSourceLinksTest(unittest.TestCase):
    def test_escaped_title_matches_decoded_detail_and_source_label(self):
        title = 'A "New" & Better Tool'
        repository = "https://github.com/Fooftilly/new-tool"
        verify_card_source_link(
            cards(card("new-tool", title, repository)),
            "new-tool", repository, "Source code", detail_heading(title),
        )

    def test_localized_accessible_label(self):
        title = 'A "New" & Better Tool'
        repository = "https://github.com/Fooftilly/new-tool"
        verify_card_source_link(
            cards(card("new-tool", title, repository, label="Izvorni kod")),
            "new-tool", repository, "Izvorni kod", detail_heading(title),
        )

    def test_repositories_swapped_between_cards_are_rejected(self):
        first = "https://github.com/Fooftilly/first"
        second = "https://github.com/Fooftilly/second"
        page = cards(card("first", "First", second),
                     card("second", "Second", first))
        with self.assertRaisesRegex(AssertionError, "Incorrect repository link"):
            verify_card_source_link(page, "first", first, "Source code", "First")

    def test_wrong_title_repeated_in_accessible_name_is_rejected(self):
        repository = "https://github.com/Fooftilly/first"
        page = cards(card("first", "Second", repository,
                          accessible_name="Source code: Second"))
        with self.assertRaisesRegex(AssertionError, "Project card title differs"):
            verify_card_source_link(page, "first", repository, "Source code", "First")

    def test_wrong_accessible_name_is_rejected(self):
        repository = "https://github.com/Fooftilly/first"
        page = cards(card("first", "First", repository,
                          accessible_name="Source code: Second"))
        with self.assertRaisesRegex(AssertionError, "Incorrect source-link accessible name"):
            verify_card_source_link(page, "first", repository, "Source code", "First")

    def test_duplicate_project_cards_are_rejected(self):
        repository = "https://github.com/Fooftilly/first"
        page = cards(card("first", "First", repository),
                     card("first", "First", repository))
        with self.assertRaisesRegex(AssertionError, "Missing/duplicate project card"):
            verify_card_source_link(page, "first", repository, "Source code", "First")

    def test_empty_rendered_project_title_is_rejected(self):
        repository = "https://github.com/Fooftilly/first"
        page = cards(card("first", "", repository,
                          accessible_name="Source code: "))
        with self.assertRaisesRegex(AssertionError, "Project card title differs"):
            verify_card_source_link(page, "first", repository, "Source code", "First")

    def test_detail_heading_is_nonempty(self):
        with self.assertRaisesRegex(AssertionError, "one nonempty heading"):
            detail_heading("")

    def test_project_disclosures_include_visible_text(self):
        page = DISCLOSURES.substitute(
            requirements=escape("A server & browser"),
            limitations=escape("No hosted demo is provided"),
        )
        verify_project_disclosures(page, "prks")

    def test_disclosures_reject_empty_requirements(self):
        page = DISCLOSURES.substitute(requirements="", limitations="No hosted demo")
        with self.assertRaisesRegex(AssertionError, "Empty project prerequisite"):
            verify_project_disclosures(page, "prks")

    def test_disclosures_reject_empty_limitations(self):
        page = DISCLOSURES.substitute(requirements="Local endpoint", limitations="")
        with self.assertRaisesRegex(AssertionError, "Empty project prerequisite"):
            verify_project_disclosures(page, "prks")

    def test_disclosures_reject_missing_heading(self):
        page = DETAIL.substitute(title=escape("PRKS"))
        with self.assertRaisesRegex(AssertionError, "Missing project prerequisite"):
            verify_project_disclosures(page, "prks")


    def test_project_license_link_matches_verified_source(self):
        url = "https://github.com/Fooftilly/PRKS/blob/master/LICENSE"
        verify_project_license_link(license_markup(url, "AGPL-3.0-only"), "prks",
                                    "AGPL-3.0-only", url)

    def test_project_license_link_rejects_wrong_url(self):
        url = "https://github.com/Fooftilly/PRKS/blob/master/LICENSE"
        with self.assertRaisesRegex(AssertionError, "Incorrect license link"):
            verify_project_license_link(
                license_markup("https://github.com/Fooftilly/other/blob/master/LICENSE", "AGPL-3.0-only"),
                "prks", "AGPL-3.0-only", url,
            )

    def test_project_license_link_rejects_wrong_identifier(self):
        url = "https://github.com/Fooftilly/PRKS/blob/master/LICENSE"
        with self.assertRaisesRegex(AssertionError, "Incorrect license identifier"):
            verify_project_license_link(license_markup(url, "MIT"), "prks", "AGPL-3.0-only", url)

    def test_project_license_link_requires_external_link_protections(self):
        url = "https://github.com/Fooftilly/PRKS/blob/master/LICENSE"
        with self.assertRaisesRegex(AssertionError, "Missing external-link protections"):
            verify_project_license_link(license_markup(url, "AGPL-3.0-only", rel=""),
                                        "prks", "AGPL-3.0-only", url)



if __name__ == "__main__":
    unittest.main()
