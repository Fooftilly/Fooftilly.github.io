/** Search the current Git-managed project catalog; no remote API, fixed IDs,
 * or mutable client-side copy of project metadata.
 */
export interface PublicProject {
  id: string;
  title: string;
  summary: string;
  summarySh?: string;
  repository: string;
  tags: string[];
  status?: "Work in progress" | "Maintained" | "Archived";
}
/** A single source for the existing EN/SH project status labels. */
const PROJECT_STATUS_SH: Record<NonNullable<PublicProject["status"]>, string> = {
  "Work in progress": "U razvoju",
  Maintained: "Aktivno",
  Archived: "Arhivirano",
};
export function projectStatusLabel(status: PublicProject["status"], lang: "en" | "sh" = "en"): string {
  return status ? (lang === "sh" ? PROJECT_STATUS_SH[status] : status) : "";
}
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
/** Exact tag selection complements, rather than replaces, free-text search. */
export function filterProjects<T extends PublicProject>(projects: readonly T[], query: string, tag = ""): T[] {
  const terms = fold(query.trim()).split(/\s+/).filter(Boolean);
  const selected = tag.normalize("NFC").toLowerCase();
  return projects.filter(project => {
    if (selected && !project.tags.some(label => label.normalize("NFC").toLowerCase() === selected)) return false;
    const text = fold([project.title,project.summary,project.summarySh ?? "",
      project.status ?? "",projectStatusLabel(project.status, "sh"),...project.tags].join(" "));
    return terms.every(term => text.includes(term));
  });
}
/** Resolve only a label currently present in the repository's public source. */
export function readProjectTag(search: string, availableTags: readonly string[]): string {
  const request = new URLSearchParams(search).get("tag")?.normalize("NFC").toLowerCase();
  return availableTags.find(label => label.normalize("NFC").toLowerCase() === request) ?? "";
}
export function projectTagHref(tag: string, lang: "en" | "sh" = "en"): string {
  return (lang === "sh" ? "/sh/projects/" : "/projects/") + "?" + new URLSearchParams({tag});
}
export function readProjectSearchQuery(search: string): string {
  return (new URLSearchParams(search).get("q") ?? "").trim();
}
/** Keep unrelated link state without adding a history entry for every keypress. */
export function projectSearchHref(href: string, query: string, tag = ""): string {
  const next = new URL(href);
  next.searchParams.delete("q");
  next.searchParams.delete("tag");
  if (query.trim()) next.searchParams.set("q",query.trim());
  if (tag) next.searchParams.set("tag",tag);
  return next.pathname + next.search + next.hash;
}
