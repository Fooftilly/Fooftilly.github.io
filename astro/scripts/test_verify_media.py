"""Media output regressions use real HTML parsing and synthetic local records."""
from pathlib import Path
import json
import tempfile
import unittest
from verify_media import (MediaParser, normalize_external_url,
                          normalize_external_urls, source_media_links, verify_media_output,
                          verify_status_control_availability)


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
                f"<h1>{title}</h1><p>No {title.lower()} yet.</p>",
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
            '<td>Finished</td>'
            '<td><a href="https://letterboxd.com/film/example/">Letterboxd</a></td></tr>'
        )
        (self.astro / "dist" / "films" / "index.html").write_text(
            "<h1>Films</h1><table><tbody>" + markup + "</tbody></table>",
            encoding="utf-8"
        )
        return markup

    def test_status_controls_track_actual_source_classifications(self):
        verify_status_control_availability(self.astro)
        self.put_film()
        with self.assertRaisesRegex(AssertionError, "source-aware status controls for films"):
            verify_status_control_availability(self.astro)
        page = self.astro / "dist" / "films" / "index.html"
        original = page.read_text(encoding="utf-8")
        page.write_text(original.replace("<h1>Films</h1>",
                         '<h1>Films</h1><div class="status-controls"></div>'),
                        encoding="utf-8")
        verify_status_control_availability(self.astro)
        source = self.root / "content" / "media" / "films" / "a-film.json"
        data = json.loads(source.read_text(encoding="utf-8"))
        del data["status"]
        source.write_text(json.dumps(data), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "source-aware status controls for films"):
            verify_status_control_availability(self.astro)

    def test_nested_ratings_parser_audits_exact_source_values(self):
        from verify_media import expected_row
        album = {"schema": 1, "kind": "music", "title": "Album",
                 "tracks": [{"disc": 1, "number": 1, "title": "Intro", "rating": 4.5},
                            {"disc": 1, "number": 2, "title": "Second"}]}
        series = {"schema": 1, "kind": "tv", "title": "Anime",
                  "seasons": [{"number": 0, "rating": 3,
                               "episodes": [{"number": 1, "title": "OVA", "rating": 4.5}]}]}
        album_html = (Path(__file__).with_name("fixtures") / "media-album-subratings.html").read_text(encoding="utf-8")
        parsed = MediaParser()
        parsed.feed(album_html)
        self.assertEqual(parsed.rows[0]["tracks"], expected_row(album)["tracks"])
        self.assertNotEqual(parsed.rows[0]["tracks"], [
            {"disc": 1, "number": 1, "title": "Intro", "rating": 2.0}])
        season_html = (Path(__file__).with_name("fixtures") / "media-series-subratings.html").read_text(encoding="utf-8")
        parsed = MediaParser()
        parsed.feed(season_html)
        self.assertEqual(parsed.rows[0]["seasons"], expected_row(series)["seasons"])
        self.assertEqual(parsed.rows[0]["episodes"], expected_row(series)["episodes"])

    def test_normalized_nested_track_and_visible_rating_parity(self):
        record = {"schema": 1, "kind": "music", "title": "Album",
                  "rating": 4.0, "status": "finished",
                  "tracks": [{"disc": 1, "number": 1,
                              "title": " Intro ", "rating": 4.5}]}
        (self.root / "content" / "media" / "music" / "album.json").write_text(
            json.dumps(record), encoding="utf-8")
        html = (Path(__file__).with_name("fixtures") /
                "media-visible-track-score.html").read_text(encoding="utf-8")
        page = self.astro / "dist" / "music" / "index.html"
        page.write_text(html, encoding="utf-8")
        self.assertEqual(verify_media_output(self.astro), 1)
        for broken in (
            html.replace('>4.5 / 5</span>', '>3.5 / 5</span>'),
            html.replace('aria-label="4.5 out of 5 stars"',
                         'aria-label="3.5 out of 5 stars"'),
            html.replace('1.1 — Intro', '1.1 — Other'),
        ):
            page.write_text(broken, encoding="utf-8")
            with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
                verify_media_output(self.astro)

    def test_compact_ids_expand_independently_to_exact_public_urls(self):
        source = {"refs": {
            "imdb": "tt0050083", "tmdb": "movie:389",
            "wikipedia": "en:12_Angry_Men", "letterboxd": "3bf2",
            "musicbrainz": "05affa96-5959-32da-8d75-1c9eb985ca59",
        }, "links": [{"label": "Criterion", "url": "https://www.criterion.com/films/example"}]}
        self.assertEqual(source_media_links(source), [
            {"label": "IMDb", "url": "https://www.imdb.com/title/tt0050083/"},
            {"label": "TMDb", "url": "https://www.themoviedb.org/movie/389"},
            {"label": "Wikipedia", "url": "https://en.wikipedia.org/wiki/12_Angry_Men"},
            {"label": "Letterboxd", "url": "https://boxd.it/3bf2"},
            {"label": "MusicBrainz",
             "url": "https://musicbrainz.org/release-group/05affa96-5959-32da-8d75-1c9eb985ca59"},
            {"label": "Criterion", "url": "https://www.criterion.com/films/example"},
        ])
        for invalid in [
            {"refs": {"imdb": "wrong"}},
            {"refs": {"tmdb": "movie:0"}},
            {"refs": {"trakt": "123"}},
            {"refs": {"wikipedia": "en:../wrong"}},
            {"refs": {"musicbrainz": "not-uuid"}},
        ]:
            with self.subTest(invalid=invalid), self.assertRaises(AssertionError):
                source_media_links(invalid)

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

    def test_query_apostrophe_matches_browser_serialization(self):
        # WHATWG encodes apostrophes in HTTPS queries but keeps them in paths/fragments.
        record = {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [{"label": "Letterboxd", "url": "https://example.org/a'path?q=O'Reilly&ref=library#it's"}],
        }
        self.put_film(record=record)
        page = self.astro / "dist" / "films" / "index.html"
        html = page.read_text(encoding="utf-8").replace(
            "https://letterboxd.com/film/example/",
            "https://example.org/a'path?q=O%27Reilly&amp;ref=library#it's",
        )
        page.write_text(html, encoding="utf-8")
        self.assertEqual(verify_media_output(self.astro), 1)

        # Reject a rendered URL that did not follow browser serialization.
        page.write_text(html.replace("O%27Reilly", "O'Reilly"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_valid_path_punctuation_matches_rendered_browser_href(self):
        record = {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [{"label": "Letterboxd", "url":
                "https://en.wikipedia.org/wiki/Simon_&_Garfunkel?source=O'Reilly&ref=library#it's"}],
        }
        self.put_film(record=record)
        page = self.astro / "dist" / "films" / "index.html"
        html = page.read_text(encoding="utf-8").replace(
            "https://letterboxd.com/film/example/",
            "https://en.wikipedia.org/wiki/Simon_&amp;_Garfunkel?source=O%27Reilly&amp;ref=library#it's",
        )
        page.write_text(html, encoding="utf-8")
        self.assertEqual(verify_media_output(self.astro), 1)

        page.write_text(html.replace("Simon_&amp;_Garfunkel", "Simon_%26_Garfunkel"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_url_components_match_whatwg_encoding_of_valid_punctuation(self):
        # Use percent-encoded caret: raw ^ serialization differs across Node releases.
        examples = (
            ("https://example.org/path$&+;=@[]|%5E!?a=1&b=2#x?z",
             "https://example.org/path$&+;=@[]|%5E!?a=1&b=2#x?z"),
            ("https://example.org/a%20b?q=A B#A B",
             "https://example.org/a%20b?q=A%20B#A%20B"),
            ("https://example.org/some%5Epath/~_!$&'()+,:;=@[]|?a=%26&b=%2520#foo`bar",
             "https://example.org/some%5Epath/~_!$&'()+,:;=@[]|?a=%26&b=%2520#foo%60bar"),
            ("https://example.org/mañana?name=João&name2=Émile#té",
             "https://example.org/ma%C3%B1ana?name=Jo%C3%A3o&name2=%C3%89mile#t%C3%A9"),
            ("https://EXAMPLE.org:443/path", "https://example.org/path"),
            ("https://faß.de/", "https://xn--fa-hia.de/"),
            ("https://[2001:0db8:0000:0000:0000:0000:0000:0001]/", "https://[2001:db8::1]/"),
            ("https://example.org/a/../../b", "https://example.org/b"),
            ("https://example.org/?", "https://example.org/?"),
            ("https://example.org/#", "https://example.org/#"),
            ("https://example.org/?#", "https://example.org/?#"),
            ("https://example.org/reviews/../film", "https://example.org/film"),
            ("https://example.org/reviews/%2E%2e/film", "https://example.org/film"),
            ("https://example.org/reviews/.%2e/film", "https://example.org/film"),
            ("https://example.org/reviews/%2e./film", "https://example.org/film"),
            ("https://example.org/reviews/%2e/film", "https://example.org/reviews/film"),
            ("https://example.org/reviews/..", "https://example.org/"),
            ("https://example.org/reviews/%2e", "https://example.org/reviews/"),
            ("https://example.org/a/../../b", "https://example.org/b"),
            ("https://example.org/a//../b", "https://example.org/a/b"),
            ("https://example.org/..//film", "https://example.org//film"),
            ("https://example.org/%2e%2E//film", "https://example.org//film"),
            ("https://example.org/a/../../../..//film", "https://example.org//film"),
        )
        for raw, expected in examples:
            with self.subTest(raw=raw):
                self.assertEqual(normalize_external_url(raw), expected)

    def test_idna_ipv6_and_individually_trimmed_link_labels(self):
        record = {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [
                {"label": " First ", "url": "https://faß.de/"},
                {"label": " Second ", "url":
                    "https://[2001:0db8:0000:0000:0000:0000:0000:0001]/"},
            ],
        }
        row = (
            '<tr><th scope="row">A &nbsp;Film &amp; You'
            '<details><summary>Notes</summary><p class="notes">A  personal note</p></details>'
            '</th><td>Émilie</td><td>2001</td>'
            '<td aria-label="3.5 out of 5 stars">3.5 / 5</td>'
            '<td>Finished</td><td>'
            '<a href="https://xn--fa-hia.de/">First</a>'
            '<a href="https://[2001:db8::1]/">Second</a>'
            '</td></tr>'
        )
        self.put_film(record=record, row=row)
        self.assertEqual(verify_media_output(self.astro), 1)
        page = self.astro / "dist" / "films" / "index.html"
        html = page.read_text(encoding="utf-8")
        # Each link still matches, but untrimmed separator text changes the cell.
        page.write_text(html.replace("First</a><a", "First</a> <a"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)
        # A host mangled by legacy Python IDNA must also fail exact href audit.
        page.write_text(html.replace("xn--fa-hia.de", "fass.de"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_batch_url_audit_rejects_unsafe_urls_without_truncation(self):
        urls = ["https://faß.de/", "https://[2001:db8::1]/"]
        self.assertEqual(normalize_external_urls(urls), {
            "https://faß.de/": "https://xn--fa-hia.de/",
            "https://[2001:db8::1]/": "https://[2001:db8::1]/",
        })
        for unsafe in ("javascript:alert(1)", "https://user:secret@example.org/"):
            with self.subTest(unsafe=unsafe):
                with self.assertRaisesRegex(AssertionError, "Invalid public media URL"):
                    normalize_external_url(unsafe)

    def test_rendered_media_accepts_canonicalized_dot_segments(self):
        record = {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [{"label": "Letterboxd", "url": "https://example.org/reviews/%2E%2e/film"}],
        }
        self.put_film(record=record)
        page = self.astro / "dist" / "films" / "index.html"
        html = page.read_text(encoding="utf-8").replace(
            "https://letterboxd.com/film/example/", "https://example.org/film"
        )
        page.write_text(html, encoding="utf-8")
        self.assertEqual(verify_media_output(self.astro), 1)

        page.write_text(html.replace("https://example.org/film",
                                     "https://example.org/reviews/../film"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_rendered_media_preserves_root_level_double_slash(self):
        record = {
            "schema": 1, "kind": "films", "title": "A  Film & You",
            "creator": "Émilie", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "A  personal note",
            "links": [{"label": "Letterboxd", "url": "https://example.org/%2e%2e//film"}],
        }
        self.put_film(record=record)
        page = self.astro / "dist" / "films" / "index.html"
        html = page.read_text(encoding="utf-8").replace(
            "https://letterboxd.com/film/example/", "https://example.org//film"
        )
        page.write_text(html, encoding="utf-8")
        self.assertEqual(verify_media_output(self.astro), 1)

        page.write_text(html.replace("https://example.org//film",
                                     "https://example.org/film"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_decomposed_unicode_matches_nfc_rendered_record(self):
        record = {
            "schema": 1, "kind": "films", "title": "Cafe\u0301 & Friends",
            "creator": "E\u0301mile", "year": 2001, "rating": 3.5,
            "status": "finished", "notes": "Re\u0301sume\u0301",
            "links": [{"label": "Cafe\u0301",
                       "url": "https://example.org/cafe\u0301?name=E\u0301mile"}],
        }
        row = (
            '<tr><th scope="row">Café &amp; Friends'
            '<details><summary>Notes</summary><p class="notes">Résumé</p></details>'
            '</th><td>Émile</td><td>2001</td>'
            '<td aria-label="3.5 out of 5 stars">3.5 / 5</td>'
            '<td>Finished</td>'
            '<td><a href="https://example.org/caf%C3%A9?name=%C3%89mile">Café</a></td></tr>'
        )
        self.put_film(record=record, row=row)
        self.assertEqual(verify_media_output(self.astro), 1)

        page = self.astro / "dist" / "films" / "index.html"
        html = page.read_text(encoding="utf-8")
        page.write_text(html.replace("Résumé", "Different note"), encoding="utf-8")
        with self.assertRaisesRegex(AssertionError, "rendered data mismatch"):
            verify_media_output(self.astro)

    def test_decimal_and_exponent_integral_years_match_js_rendering(self):
        for source_year, rendered in (("2001.0", "2001"), ("2e3", "2000")):
            with self.subTest(source_year=source_year):
                self.put_film()
                source = self.root / "content" / "media" / "films" / "a-film.json"
                data = source.read_text(encoding="utf-8")
                self.assertIn('"year": 2001', data)
                source.write_text(
                    data.replace('"year": 2001', f'"year": {source_year}'),
                    encoding="utf-8",
                )
                if rendered != "2001":
                    page = self.astro / "dist" / "films" / "index.html"
                    page.write_text(
                        page.read_text(encoding="utf-8").replace(
                            "<td>2001</td>", f"<td>{rendered}</td>"
                        ),
                        encoding="utf-8",
                    )
                self.assertEqual(verify_media_output(self.astro), 1)

    def test_invalid_years_do_not_pass_output_audit(self):
        for source_year in ("2001.5", "true", '"2001"', "null"):
            with self.subTest(source_year=source_year):
                self.put_film()
                source = self.root / "content" / "media" / "films" / "a-film.json"
                data = source.read_text(encoding="utf-8")
                source.write_text(
                    data.replace('"year": 2001', f'"year": {source_year}'),
                    encoding="utf-8",
                )
                with self.assertRaisesRegex(AssertionError, "Invalid year"):
                    verify_media_output(self.astro)

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
