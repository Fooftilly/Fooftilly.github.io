"""Regression tests for localized project-card links (no Astro build required)."""
from html import escape
import unittest

from verify_projects import parse_project_cards, verify_card_source_link


def card(slug, title, repository, label="Source code", accessible_name=None):
    if accessible_name is None:
        accessible_name = f"{label}: {title}"
    return (
        '<li class="project-card">'
        f'<h3><a href="/projects/{slug}/">{escape(title)}</a></h3>'
        '<ul class="project-tags"><li>Research</li></ul>'
        '<p class="project-source">'
        f'<a href="{escape(repository, quote=True)}" rel="noopener noreferrer" '
        f'aria-label="{escape(accessible_name, quote=True)}">{label}</a>'
        '</p></li>'
    )


def cards(*items):
    return parse_project_cards('<ul class="project-cards">' + ''.join(items) + '</ul>')


class ProjectSourceLinksTest(unittest.TestCase):
    def test_decoded_quoted_and_ampersand_title_matches_accessible_name(self):
        title = 'A "New" & Better Tool'
        repo = "https://github.com/Fooftilly/new-tool"
        self.assertEqual(len(cards(card("new-tool", title, repo))), 1)
        verify_card_source_link(cards(card("new-tool", title, repo)),
                                "new-tool", repo, "Source code")

    def test_localized_accessible_label(self):
        title = 'A "New" & Better Tool'
        repo = "https://github.com/Fooftilly/new-tool"
        verify_card_source_link(
            cards(card("new-tool", title, repo, label="Izvorni kod")),
            "new-tool", repo, "Izvorni kod",
        )

    def test_repositories_swapped_between_cards_are_rejected(self):
        first = "https://github.com/Fooftilly/first"
        second = "https://github.com/Fooftilly/second"
        page = cards(card("first", "First", second),
                     card("second", "Second", first))
        with self.assertRaisesRegex(AssertionError, "Incorrect repository link"):
            verify_card_source_link(page, "first", first, "Source code")

    def test_incorrect_project_name_in_accessible_label_is_rejected(self):
        repo = "https://github.com/Fooftilly/first"
        page = cards(card("first", "First", repo,
                          accessible_name="Source code: Second"))
        with self.assertRaisesRegex(AssertionError, "Incorrect source-link accessible name"):
            verify_card_source_link(page, "first", repo, "Source code")

    def test_duplicate_project_cards_are_rejected(self):
        repo = "https://github.com/Fooftilly/first"
        page = cards(card("first", "First", repo), card("first", "First", repo))
        with self.assertRaisesRegex(AssertionError, "Missing/duplicate project card"):
            verify_card_source_link(page, "first", repo, "Source code")

    def test_empty_rendered_project_title_is_rejected(self):
        repo = "https://github.com/Fooftilly/first"
        page = cards(card("first", "", repo,
                          accessible_name="Source code: "))
        with self.assertRaisesRegex(AssertionError, "Missing rendered project title"):
            verify_card_source_link(page, "first", repo, "Source code")


if __name__ == "__main__":
    unittest.main()
