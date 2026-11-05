"""Audit Git-managed project showcases against generated, standalone public HTML.

No network calls or external dependencies. Source Markdown is authoritative.
"""
from html.parser import HTMLParser
import re
from pathlib import Path


class ProjectCardParser(HTMLParser):
    """Collect anchor destinations and text within each project card."""

    def __init__(self):
        super().__init__()
        self.cards = []
        self._card = None
        self._li_depth = 0
        self._link = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "li":
            if self._card is not None:
                self._li_depth += 1
            elif "project-card" in attrs.get("class", "").split():
                self._card = []
                self._li_depth = 1
        if tag == "a" and self._card is not None:
            self._link = {"attrs": attrs, "text": ""}
            self._card.append(self._link)

    def handle_data(self, data):
        if self._link is not None:
            self._link["text"] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self._link = None
        if tag == "li" and self._card is not None:
            self._li_depth -= 1
            if self._li_depth == 0:
                self.cards.append(self._card)
                self._card = None


def parse_project_cards(page):
    parser = ProjectCardParser()
    parser.feed(page)
    parser.close()
    assert parser._card is None, "Unclosed project card"
    return parser.cards


class ProjectHeadingParser(HTMLParser):
    """Read the project title from the separately rendered detail page."""

    def __init__(self):
        super().__init__()
        self.headings = []
        self._parts = None

    def handle_starttag(self, tag, attrs):
        if tag == "h1":
            self._parts = []

    def handle_data(self, data):
        if self._parts is not None:
            self._parts.append(data)

    def handle_endtag(self, tag):
        if tag == "h1" and self._parts is not None:
            self.headings.append("".join(self._parts).strip())
            self._parts = None


def parse_project_heading(page):
    parser = ProjectHeadingParser()
    parser.feed(page)
    parser.close()
    assert len(parser.headings) == 1 and parser.headings[0], (
        "Project detail must have one nonempty heading", parser.headings
    )
    return parser.headings[0]


def verify_card_source_link(cards, slug, repository, label, expected_title):
    """Check source links against the separately rendered project detail title.

    The detail page and card are independent templates backed by canonical
    project Markdown. HTMLParser decodes entities, so escaped YAML syntax
    never has to be parsed from raw frontmatter lines.
    """
    detail_path = f"/projects/{slug}/"
    matching = [card for card in cards
                if any(link["attrs"].get("href") == detail_path for link in card)]
    assert len(matching) == 1, ("Missing/duplicate project card", slug, label)
    card = matching[0]
    details = [link for link in card if link["attrs"].get("href") == detail_path]
    assert len(details) == 1, ("Missing/duplicate detail link", slug, label)
    title = details[0]["text"].strip()
    assert title == expected_title, (
        "Project card title differs from detail page", slug, label, title, expected_title
    )

    links = [link for link in card if link["attrs"].get("href") == repository]
    assert len(links) == 1, ("Incorrect repository link in project card", slug, label)
    link = links[0]
    assert link["text"].strip() == label, ("Incorrect source-link text", slug, label)
    assert link["attrs"].get("aria-label") == f"{label}: {title}", (
        "Incorrect source-link accessible name", slug, label
    )
    assert {"noopener", "noreferrer"}.issubset(
        link["attrs"].get("rel", "").split()
    ), ("Missing external-link protections", slug, label)


def verify_projects(dist: Path, source: Path, origin: str) -> None:
    items = sorted(source.glob("*.md"))
    assert len(items) >= 3, "Missing initial project showcase content"
    index = (dist / "projects/index.html").read_text(encoding="utf8")
    assert "<h1" in index and "Projects" in index
    local_index=(dist / "sh/projects/index.html").read_text(encoding="utf8")
    assert "<h1" in local_index and "Projekti" in local_index
    indexes = (("Source code", parse_project_cards(index)),
               ("Izvorni kod", parse_project_cards(local_index)))
    for item in items:
        slug = item.stem
        assert slug and all(c.islower() or c.isdigit() or c == "-" for c in slug), slug
        body = item.read_text(encoding="utf8")
        assert body.startswith("---\n"), ("Missing frontmatter", item)
        repositories = [line.removeprefix("repository: ").strip('"').strip("'")
                        for line in body.splitlines() if line.startswith("repository: ")]
        assert len(repositories) == 1, ("Missing source repository", item)
        repository = repositories[0]
        assert repository.startswith("https://github.com/Fooftilly/"), item
        result = dist / "projects" / slug / "index.html"
        assert result.is_file(), ("Missing project detail", slug)
        html = result.read_text(encoding="utf8")
        expected_title = parse_project_heading(html)
        # The initial showcases must expose prerequisite and limitation
        # headings, but future fixture projects may omit these sections.
        if slug in {"prks", "kokoro-extension", "local-search-mcp"}:
            for heading in ("Requirements", "Limitations"):
                assert re.search(r"<h2\b[^>]*>\s*" + heading + r"\s*</h2>", html), (
                    "Missing project prerequisite/limitation disclosure", slug, heading
                )
        assert 'href="/projects/' + slug + '/"' in index, ("Missing index entry", slug)
        assert 'href="/projects/' + slug + '/"' in local_index, ("Missing SH index entry", slug)
        # Check source links in each rendered card, not anywhere on the page.
        for label, cards in indexes:
            verify_card_source_link(cards, slug, repository, label, expected_title)
        assert 'href="' + repository + '"' in html, ("Missing source link", slug)
        assert origin + "/projects/" + slug + "/" in html, ("Missing canonical URL", slug)
        assert "<h1" in html and "<iframe" not in html, ("Project page missing heading or embeds", slug)
    for homepage, route in ((dist / "index.html", "/projects/"),
                            (dist / "sh/index.html", "/sh/projects/")):
        html = homepage.read_text(encoding="utf8")
        assert f'href="{route}"' in html, ("Missing localized project navigation", homepage)
    print(f"Verified {len(items)} project showcases with source links and static routes")


if __name__ == "__main__":
    verify_projects(
        Path(__file__).resolve().parents[1] / "dist",
        Path(__file__).resolve().parents[2] / "content/projects",
        "https://www.peroniko.xyz",
    )
