"""Offline regressions for MusicBrainz album/EP/single verification."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    "verify_rym_albums", Path(__file__).with_name("verify-rym-albums.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class VerifyRymAlbumsTests(unittest.TestCase):
    def row(self, **updates):
        base = {"RYM Album": "12345", " First Name": "The", "Last Name": "Artist",
                "First Name localized": "", " Last Name localized": "",
                "Title": "Example Album", "Release_Date": "2020", "Rating": "8"}
        base.update(updates)
        return base

    def release(self, primary="Album", year="2020-05-01", title="Example Album",
                artist="The Artist", id="example-release-group"):
        return {"release-groups": [{
            "id": id, "title": title, "first-release-date": year,
            "primary-type": primary, "artist-credit": [{"name": artist}],
        }]}

    def test_only_exact_unique_album_identity_is_approved(self):
        approved = mod.classify(self.row(), self.release())
        self.assertEqual(approved["classification"], "album")
        self.assertEqual(approved["musicbrainz_release_group"], "example-release-group")
        self.assertEqual(mod.classify(self.row(), self.release("EP"))["classification"], "not_album")
        self.assertEqual(mod.classify(self.row(), self.release("Single"))["classification"], "not_album")
        self.assertEqual(mod.classify(self.row(), self.release(year="2017"))["classification"], "needs_review")
        self.assertEqual(mod.classify(self.row(), self.release(title="Different"))["classification"], "needs_review")
        self.assertEqual(mod.classify(self.row(), self.release(artist="Different"))["classification"], "needs_review")

    def test_multiple_conflicting_release_groups_require_review(self):
        groups = self.release()
        groups["release-groups"].append(self.release("EP", id="different")["release-groups"][0])
        self.assertEqual(mod.classify(self.row(), groups)["classification"], "needs_review")

    def test_artist_variants_only_help_matching_not_display_name_choice(self):
        row = self.row(**{" First Name": "", "Last Name": "박지하",
                          " Last Name localized": "Park Jiha"})
        self.assertEqual(mod.artist_names(row), ["박지하", "Park Jiha"])
        mb = self.release(artist="Park Jiha")
        self.assertEqual(mod.classify(row, mb)["classification"], "album")

    def test_offline_defaults_unverified_and_never_fetches(self):
        report = mod.verify([self.row()], {}, fetch=False)
        self.assertEqual(report["summary"], {"album": 0, "not_album": 0, "needs_review": 1})
        self.assertNotIn("Rating", str(report))
        self.assertNotIn("Ownership", str(report))


if __name__ == "__main__":
    unittest.main()
