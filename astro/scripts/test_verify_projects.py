"""Regression tests for source-linked project cards (no Astro build required)."""
from html import escape
from pathlib import Path
from string import Template
import unittest

from verify_projects import (
    parse_project_cards,
    parse_project_heading,
    verify_card_source_link,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures"
CARD = Template((FIXTURES / "project-card.html").read_text(encoding="utf-8"))
DETAIL = Template((FIXTURES / "project-detail.html").read_text(encoding="utf-8"))


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


if __name__ == "__main__":
    unittest.main()
