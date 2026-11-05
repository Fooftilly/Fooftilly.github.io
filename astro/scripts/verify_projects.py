"""Audit Git-managed project showcases against generated, standalone public HTML.

No network calls or external dependencies. Source Markdown is authoritative.
"""
from pathlib import Path


def verify_projects(dist: Path, source: Path, origin: str) -> None:
    items = sorted(source.glob("*.md"))
    assert len(items) >= 3, "Missing initial project showcase content"
    index = (dist / "projects/index.html").read_text(encoding="utf8")
    assert "<h1" in index and "Projects" in index
    for item in items:
        slug = item.stem
        assert slug and all(c.islower() or c.isdigit() or c == "-" for c in slug), slug
        body = item.read_text(encoding="utf8")
        assert body.startswith("---\n"), ("Missing frontmatter", item)
        repositories = [line.removeprefix("repository: ").strip('"')
                        for line in body.splitlines() if line.startswith("repository: ")]
        assert len(repositories) == 1, ("Missing source repository", item)
        repository = repositories[0]
        assert repository.startswith("https://github.com/Fooftilly/"), item
        result = dist / "projects" / slug / "index.html"
        assert result.is_file(), ("Missing project detail", slug)
        html = result.read_text(encoding="utf8")
        assert 'href="/projects/' + slug + '/"' in index, ("Missing index entry", slug)
        assert 'href="' + repository + '"' in html, ("Missing source link", slug)
        assert origin + "/projects/" + slug + "/" in html, ("Missing canonical URL", slug)
        assert "<h1" in html and "<iframe" not in html, ("Project page missing heading or embeds", slug)
    for homepage in (dist / "index.html", dist / "sh/index.html"):
        html = homepage.read_text(encoding="utf8")
        assert 'href="/projects/"' in html, ("Missing project navigation", homepage)
    print(f"Verified {len(items)} project showcases with source links and static routes")


if __name__ == "__main__":
    verify_projects(
        Path(__file__).resolve().parents[1] / "dist",
        Path(__file__).resolve().parents[2] / "content/projects",
        "https://www.peroniko.xyz",
    )
