"""Privacy-preserving regression cases for owner media export reconciliation."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "reconcile_media_exports", Path(__file__).with_name("reconcile-media-exports.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
csv_rows, reconcile, rating, key = (module.csv_rows, module.reconcile,
                                    module.rating, module.key)


class ExportReconciliationTests(unittest.TestCase):
    def test_correct_scale_and_html_unicode_matching(self):
        self.assertEqual(rating("7", "RYM"), 3.5)
        self.assertEqual(rating("4.5", "Letterboxd"), 4.5)
        self.assertIsNone(rating("0", "RYM"))
        self.assertEqual(key("Café &amp; Cinema"), key("Cafe & Cinema"))
        with self.assertRaises(ValueError):
            rating("4.2", "Letterboxd")
        with self.assertRaises(ValueError):
            rating("11", "RYM")

    def test_cross_provider_conflict_and_duplicate_are_not_automatically_imported(self):
        lb = [{"Name": "One", "Year": "2001", "Rating": "4",
               "Letterboxd URI": "https://boxd.it/one"},
              {"Name": "Two", "Year": "2002", "Rating": "3",
               "Letterboxd URI": "https://boxd.it/two"}]
        ry = [{"Title": "One", "Release_Date": "2001/03/01",
               "Rating": "7", "Film_ID": "1"},
              {"Title": "One", "Release_Date": "2001/03/01",
               "Rating": "8", "Film_ID": "2"},
              {"Title": "Two", "Release_Date": "2002/02/01",
               "Rating": "8", "Film_ID": "3"}]
        result = reconcile(lb, ry, [])
        self.assertEqual(len(result["duplicate_films"]), 1)
        self.assertEqual(len(result["rating_conflicts"]), 1)
        self.assertEqual(result["rating_conflicts"][0]["title"], "Two")

    def test_zero_rating_rym_film_does_not_count_or_override_letterboxd(self):
        lb = [{"Name": "A Film", "Year": "2001", "Rating": "4",
               "Letterboxd URI": "https://boxd.it/film"}]
        ry = [{"Title": "A Film", "Release_Date": "2001", "Rating": "0",
               "Film_ID": "123"}]
        report = reconcile(lb, ry, [])
        self.assertEqual(report["summary"]["rym_rated_films"], 0)
        self.assertEqual(report["summary"]["letterboxd_rated_films"], 1)
        self.assertEqual(report["rating_conflicts"], [])
        self.assertEqual(report["summary"]["films_same_identity_and_rating"], 0)

    def test_preserve_name_variants_for_review_not_auto_merge(self):
        lb = [{"Name": "The Movie", "Year": "2023", "Rating": "4",
               "Letterboxd URI": "link"}]
        ry = [{"Title": "Movie", "Release_Date": "2023", "Rating": "8", "Film_ID": "4"}]
        report = reconcile(lb, ry, [])
        self.assertEqual(len(report["possible_film_aliases"]), 1)
        self.assertEqual(len(report["rating_conflicts"]), 0)

    def test_missing_year_never_guessed_and_music_release_type_never_inferred(self):
        lb = [{"Name": "Unknown Film", "Year": "", "Rating": "3",
               "Letterboxd URI": "link"}]
        music = [{"RYM Album": "20", "Title": "A Single", "Release_Date": "2023",
                  "Rating": "8", " First Name": "", "Last Name": "Musician",
                  " First Name localized": "", " Last Name localized": "",
                  "Media Type": "Other", "Ownership": "o"}]
        result = reconcile(lb, [], music)
        self.assertEqual(result["summary"]["films_missing_release_year"], 1)
        self.assertEqual(result["summary"]["rym_music_release_type_verified"], 0)
        self.assertNotIn("Ownership", str(result))


    def test_csv_must_be_valid_utf8_with_expected_columns(self):
        with self.assertRaises(UnicodeDecodeError):
            csv_rows(b"Name,Rating\n\xff,3", {"Name", "Rating"}, "example")
        with self.assertRaises(ValueError):
            csv_rows(b"Name\nTest", {"Name", "Rating"}, "example")


if __name__ == "__main__":
    unittest.main()
