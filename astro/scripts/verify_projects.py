"""Audit Git-managed project showcases against generated, standalone public HTML.

No network calls or external dependencies. Source Markdown is authoritative.
"""
from html.parser import HTMLParser
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
        assert 'href="/projects/' + slug + '/"' in index, ("Missing index entry", slug)
        assert 'href="/projects/' + slug + '/"' in local_index, ("Missing SH index entry", slug)
        titles = [line.removeprefix("title: ").strip().strip('"').strip("'")
                  for line in body.splitlines() if line.startswith("title: ")]
        assert len(titles) == 1 and titles[0], ("Missing source project title", slug)
        title = titles[0]
        # Bind each repository URL and accessible label to the card for its
        # own project. A URL or title copied into another card must fail.
        for label, cards in indexes:
            matching = [card for card in cards if any(
                link["attrs"].get("href") == "/projects/" + slug + "/"
                and link["text"].strip() == title
                for link in card
            )]
            assert len(matching) == 1, ("Missing/duplicate project card", slug, label)
            links = [link for link in matching[0]
                     if link["attrs"].get("href") == repository]
            assert len(links) == 1, ("Incorrect repository link in project card", slug, label)
            link = links[0]
            assert link["text"].strip() == label, ("Incorrect source-link text", slug, label)
            assert link["attrs"].get("aria-label") == f"{label}: {title}", (
                "Incorrect source-link accessible name", slug, label
            )
            assert {"noopener", "noreferrer"}.issubset(
                link["attrs"].get("rel", "").split()
            ), ("Missing external-link protections", slug, label)
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
