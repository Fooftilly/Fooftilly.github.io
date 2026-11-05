"""Audit Git-managed project showcases against generated, standalone public HTML.

No network calls or external dependencies. Source Markdown is authoritative.
"""
import re
from pathlib import Path


def verify_projects(dist: Path, source: Path, origin: str) -> None:
    items = sorted(source.glob("*.md"))
    assert len(items) >= 3, "Missing initial project showcase content"
    index = (dist / "projects/index.html").read_text(encoding="utf8")
    assert "<h1" in index and "Projects" in index
    local_index=(dist / "sh/projects/index.html").read_text(encoding="utf8")
    assert "<h1" in local_index and "Projekti" in local_index
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
        # Every card links directly to its repository in the correct language;
        # do not rely on the separate English-only project detail page.
        for label, page in (("Source code", index), ("Izvorni kod", local_index)):
            source_link = (
                r'<a\b(?=[^>]*href="' + re.escape(repository)
                + r'")(?=[^>]*rel="noopener noreferrer")'
                + r'(?=[^>]*aria-label="' + re.escape(label) + r': [^"]+")[^>]*>\s*'
                + re.escape(label) + r'\s*</a>'
            )
            assert re.search(source_link, page), (
                "Missing localized, accessible index source link", slug, label
            )
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
