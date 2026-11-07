"""Audit Git-managed project showcases against generated, standalone public HTML.

No network calls or external dependencies. Source Markdown is authoritative.
"""
from html import unescape
import json
from html.parser import HTMLParser
import re
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


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



class ProjectTagLinkParser(HTMLParser):
    """Collect technology tags and their links from rendered Astro lists."""

    def __init__(self):
        super().__init__()
        self.groups = []
        self.group = None
        self.item = None
        self.link = None

    def handle_starttag(self, tag, attrs):
        props = dict(attrs)
        if tag == "ul" and "project-tags" in props.get("class", "").split():
            assert self.group is None, "Nested project-tag groups"
            self.group = []
        elif self.group is not None and tag == "li":
            assert self.item is None, "Nested project-tag items"
            self.item = {"text": "", "links": []}
            self.group.append(self.item)
        elif self.item is not None and tag == "a":
            assert self.link is None, "Nested project-tag links"
            self.link = {"href": props.get("href"), "text": ""}
            self.item["links"].append(self.link)

    def handle_data(self, data):
        if self.item is not None:
            self.item["text"] += data
        if self.link is not None:
            self.link["text"] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self.link = None
        elif tag == "li" and self.group is not None:
            self.item = None
        elif tag == "ul" and self.group is not None:
            assert self.item is None, "Unclosed project tag"
            self.groups.append(self.group)
            self.group = None


def parse_source_project_tags(body: str, slug: str) -> list[str]:
    """Read the Git-owned technology labels independently of rendered HTML.

    Project frontmatter currently uses JSON-compatible YAML flow arrays. A
    different representation must be explicitly supported here instead of
    silently trusting tags from generated detail pages.
    """
    frontmatter = body.split("\n---\n", 1)[0]
    fields = re.findall(r"(?m)^tags:\s*(\[[^\n]*\])\s*$", frontmatter)
    assert len(fields) == 1, ("Missing or unsupported project source tags", slug)
    try:
        tags = json.loads(fields[0])
    except json.JSONDecodeError as exc:
        raise AssertionError(("Invalid project source tag array", slug)) from exc
    assert isinstance(tags, list) and tags and all(
        isinstance(tag, str) and tag.strip() == tag and tag for tag in tags
    ), ("Invalid project source tags", slug)
    return tags


def verify_project_tag_links(html: str, language: str, require_groups=True) -> list[list[str]]:
    """Every rendered tag links to exact source-tag search in its own locale.

    Accept changing source labels, including Unicode, and disallow links which
    only appear clickable but select an unrelated or broader search.
    """
    assert language in ("en", "sh"), "Unsupported project locale"
    parser = ProjectTagLinkParser()
    parser.feed(html)
    parser.close()
    assert parser.group is None and parser.item is None, "Unclosed project tag list"
    if require_groups:
        assert parser.groups, "Missing project-tag list"
    destination = "/sh/projects/" if language == "sh" else "/projects/"
    for group in parser.groups:
        assert group, "Empty project-tag list"
        for item in group:
            links = item["links"]
            assert len(links) == 1, "Each project tag must have one link"
            link = links[0]
            visible = item["text"].strip()
            assert visible and link["text"].strip() == visible, "Project tag link label differs"
            href = urlsplit(link["href"] or "")
            assert (not href.scheme and not href.netloc and not href.fragment
                    and href.path == destination), "Project tag links to wrong locale or route"
            query = parse_qs(href.query, keep_blank_values=True)
            assert list(query) == ["tag"] and query["tag"] == [visible], (
                "Project tag link must select only its exact visible label", visible, query
            )
    return [[item["text"].strip() for item in group] for group in parser.groups]


def verify_card_tag_parity(cards, slug, expected_tags, language) -> None:
    """Compare one independently rendered card to that project's detail tags."""
    detail_url = f"/projects/{slug}/"
    matched = [card for card in cards
               if any(link["attrs"].get("href") == detail_url for link in card)]
    assert len(matched) == 1, ("Missing project card for tag parity", slug, language)
    target = "/sh/projects/" if language == "sh" else "/projects/"
    tag_links = [link for link in matched[0]
                 if (link["attrs"].get("href") or "").startswith(target + "?tag=")]
    rendered_labels = [link["text"].strip() for link in tag_links]
    assert rendered_labels == expected_tags, (
        "Project card tags differ from current detail/source tags",
        slug, language, expected_tags, rendered_labels
    )


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


def verify_project_disclosures(page: str, slug: str, headings=("Requirements", "Limitations")) -> None:
    """Require meaningful rendered text for disclosure headings present in source."""
    for heading in headings:
        # Each heading's content ends at the next heading or closing section.
        # Checking only the heading would allow empty disclosures to ship.
        pattern = r"<h2\b[^>]*>\s*" + heading + r"\s*</h2>(.*?)(?=<h2\b|</section>)"
        match = re.search(pattern, page, flags=re.DOTALL)
        assert match, ("Missing project prerequisite/limitation disclosure", slug, heading)
        visible = unescape(re.sub(r"<[^>]+>", " ", match.group(1))).strip()
        assert visible, ("Empty project prerequisite/limitation disclosure", slug, heading)


class ProjectLicenseParser(HTMLParser):
    """Collect links and text only from the rendered project-license paragraph."""

    def __init__(self):
        super().__init__()
        self.in_license = False
        self.links = []
        self.link = None
        self.labels = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "p" and "project-license" in attrs.get("class", "").split():
            self.in_license = True
        elif tag == "a" and self.in_license:
            self.link = {"attrs": attrs, "text": ""}
            self.links.append(self.link)

    def handle_data(self, data):
        if self.in_license:
            self.labels.append(data)
            if self.link is not None:
                self.link["text"] += data

    def handle_endtag(self, tag):
        if tag == "a":
            self.link = None
        elif tag == "p" and self.in_license:
            self.in_license = False


def verify_project_license_link(html: str, slug: str, license: str, license_url: str):
    parser = ProjectLicenseParser()
    parser.feed(html)
    parser.close()
    assert "License:" in " ".join(parser.labels), ("Missing license label", slug)
    assert len(parser.links) == 1, ("Missing or duplicate license link", slug)
    link = parser.links[0]
    assert link["attrs"].get("href") == license_url, ("Incorrect license link", slug)
    assert link["text"].strip() == license, ("Incorrect license identifier", slug)
    assert {"noopener", "noreferrer"}.issubset(
        link["attrs"].get("rel", "").split()
    ), ("Missing external-link protections on license", slug)


def verify_projects(dist: Path, source: Path, origin: str) -> None:
    items = sorted(source.glob("*.md"))
    index = (dist / "projects/index.html").read_text(encoding="utf8")
    assert "<h1" in index and "Projects" in index
    local_index=(dist / "sh/projects/index.html").read_text(encoding="utf8")
    assert "<h1" in local_index and "Projekti" in local_index
    assert "<noscript>" in index and "Search and tag filtering require JavaScript" in index, (
        "EN project index must explain its complete no-JS fallback"
    )
    assert "<noscript>" in local_index and "Pretraga i filtriranje oznaka" in local_index, (
        "SH project index must explain its complete no-JS fallback"
    )
    assert len(verify_project_tag_links(index, "en", require_groups=bool(items))) == len(items), (
        "EN directory omitted a project's tag list"
    )
    assert len(verify_project_tag_links(local_index, "sh", require_groups=bool(items))) == len(items), (
        "SH directory omitted a project's tag list"
    )
    indexes = (("Source code", parse_project_cards(index)),
               ("Izvorni kod", parse_project_cards(local_index)))
    for label, cards in indexes:
        assert len(cards) == len(items), ("Project cards must reflect current source", label)
    expected_details = {item.stem for item in items}
    actual_details = {page.parent.name for page in (dist / "projects").glob("*/index.html")}
    assert actual_details == expected_details, ("Project detail source parity", actual_details ^ expected_details)
    source_tag_labels = {}
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
        detail_groups = verify_project_tag_links(html, "en")
        assert len(detail_groups) == 1, ("Project detail requires one tag list", slug)
        source_tags = parse_source_project_tags(body, slug)
        assert detail_groups[0] == source_tags, (
            "Project detail tags differ from canonical Markdown", slug,
            source_tags, detail_groups[0]
        )
        source_tag_labels[slug] = source_tags
        expected_title = parse_project_heading(html)
        # Check each optional source disclosure without pinning original projects.
        for heading in ("Requirements", "Limitations"):
            if re.search(r"(?m)^##\s+" + re.escape(heading) + r"\s*$", body):
                verify_project_disclosures(html, slug, (heading,))
        license_values = [line.removeprefix("license: ").strip().strip('"').strip("'")
                          for line in body.splitlines() if line.startswith("license: ")]
        assert len(license_values) == 1 and license_values[0], (
            "Missing canonical project license identifier", slug
        )
        license_urls = [line.removeprefix("licenseUrl: ").strip().strip('"').strip("'")
                        for line in body.splitlines() if line.startswith("licenseUrl: ")]
        assert len(license_urls) <= 1, ("Duplicate project license URL", slug)
        if license_urls:
            verify_project_license_link(html, slug, license_values[0], license_urls[0])
        else:
            parser = ProjectLicenseParser()
            parser.feed(html)
            parser.close()
            assert not parser.links, ("Unexpected linked license with no source URL", slug)
            assert "License:" in " ".join(parser.labels), ("Missing license label", slug)
            assert license_values[0] in " ".join(parser.labels), (
                "License identifier differs from current source", slug
            )
        assert 'href="/projects/' + slug + '/"' in index, ("Missing index entry", slug)
        assert 'href="/projects/' + slug + '/"' in local_index, ("Missing SH index entry", slug)
        # Check source links in each rendered card, not anywhere on the page.
        for label, cards in indexes:
            verify_card_source_link(cards, slug, repository, label, expected_title)
            verify_card_tag_parity(cards, slug, source_tag_labels[slug],
                                   "sh" if label == "Izvorni kod" else "en")
        assert 'href="' + repository + '"' in html, ("Missing source link", slug)
        assert origin + "/projects/" + slug + "/" in html, ("Missing canonical URL", slug)
        assert "<h1" in html and "<iframe" not in html, ("Project page missing heading or embeds", slug)
    for homepage, route in ((dist / "index.html", "/projects/"),
                            (dist / "sh/index.html", "/sh/projects/")):
        html = homepage.read_text(encoding="utf8")
        language = "sh" if route.startswith("/sh/") else "en"
        cards = parse_project_cards(html)
        tag_groups = verify_project_tag_links(html, language, require_groups=bool(items))
        assert len(tag_groups) == len(cards), (
            "Homepage project preview omitted tag lists", homepage
        )
        for card in cards:
            detail_urls = [link["attrs"].get("href") for link in card
                           if re.fullmatch(r"/projects/[a-z0-9-]+/", link["attrs"].get("href") or "")]
            assert len(detail_urls) == 1, ("Homepage card must have one project detail", homepage)
            slug = detail_urls[0].split("/")[2]
            assert slug in source_tag_labels, ("Unexpected homepage preview project", slug)
            verify_card_tag_parity(cards, slug, source_tag_labels[slug], language)
        assert f'href="{route}"' in html, ("Missing localized project navigation", homepage)
    print(f"Verified {len(items)} project showcases with source links and static routes")


if __name__ == "__main__":
    verify_projects(
        Path(__file__).resolve().parents[1] / "dist",
        Path(__file__).resolve().parents[2] / "content/projects",
        "https://www.peroniko.xyz",
    )
