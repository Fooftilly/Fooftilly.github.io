"""Media output regressions use real HTML parsing and synthetic local records."""
from pathlib import Path
import json
import tempfile
import unittest
from verify_media import MediaParser, verify_media_output


PAGES = {"music": "Music", "films": "Films", "tv": "TV series"}


class MediaOutputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.astro = self.root / "astro"
        for kind, title in PAGES.items():
            (self.root / "content" / "media" / kind).mkdir(parents=True)
            page = self.astro / "dist" / kind / "index.html"
            page.parent.mkdir(parents=True)
            page.write_text(
                f"<h1>{title}</h1><p>No {title.lower()} entries have been published yet.</p>",
                encoding="utf-8",
            )

    def put_film(self, record=None, row=None):
        data = record or {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [{"label": "Letterboxd", "url": "https://letterboxd.com/film/example/"}],
        }
        (self.root / "content" / "media" / "films" / "a-film.json").write_text(
            json.dumps(data, ensure_ascii=False), encoding="utf-8"
        )
        markup = row or (
            '<tr><th scope="row">A &nbsp;Film &amp; You'
            '<details><summary>Notes</summary><p class="notes">A  personal note</p></details>'
            '</th><td>Émilie</td><td>2001</td>'
            '<td aria-label="3.5 out of 5 stars">3.5 / 5</td>'
            '<td>finished</td>'
            '<td><a href="https://letterboxd.com/film/example/">Letterboxd</a></td></tr>'
        )
        (self.astro / "dist" / "films" / "index.html").write_text(
            "<h1>Films</h1><table><tbody>" + markup + "</tbody></table>",
            encoding="utf-8"
        )
        return markup

    def test_empty_collections_are_accepted_without_inventing_ratings(self):
        self.assertEqual(verify_media_output(self.astro), 0)

    def test_full_record_parity_handles_unicode_entities_and_repeated_spaces(self):
        self.put_film()
        self.assertEqual(verify_media_output(self.astro), 1)

    def test_valid_url_without_explicit_path_renders_with_trailing_slash(self):
        record = {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [{"label": "Letterboxd", "url": "https://example.org"}],
        }
        original = self.put_film(record=record)
        page = self.astro / "dist" / "films" / "index.html"
        page.write_text(
            page.read_text().replace("https://letterboxd.com/film/example/", "https://example.org/"),
            encoding="utf-8",
        )
        self.assertEqual(verify_media_output(self.astro), 1)

    def test_substituted_record_with_same_count_is_rejected(self):
        self.put_film()
        page = self.astro / "dist" / "films" / "index.html"
        page.write_text(page.read_text().replace("Émilie", "Someone else"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_rating_and_source_href_mismatch_are_rejected(self):
        self.put_film()
        page = self.astro / "dist" / "films" / "index.html"
        original = page.read_text()
        for bad in (
            original.replace("3.5 / 5", "4.0 / 5"),
            original.replace("film/example/", "film/other/"),
            original.replace("3.5 out of 5 stars", "5 out of 5 stars"),
            original.replace("A  personal note", "Different note"),
        ):
            page.write_text(bad, encoding="utf-8")
            with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
                verify_media_output(self.astro)

    def test_unsafe_or_unexpected_extra_media_row_is_rejected(self):
        row = self.put_film()
        page = self.astro / "dist" / "films" / "index.html"
        page.write_text(page.read_text().replace("</tbody>", row + "</tbody>"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)


if __name__ == "__main__":
    unittest.main()
