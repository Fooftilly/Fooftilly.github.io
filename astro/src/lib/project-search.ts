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
export function filterProjects<T extends PublicProject>(projects: readonly T[], query: string): T[] {
  const terms = fold(query.trim()).split(/\s+/).filter(Boolean);
  return projects.filter(project => {
    const text = fold([project.title,project.summary,project.summarySh ?? "",
      project.status ?? "",projectStatusLabel(project.status, "sh"),...project.tags].join(" "));
    return terms.every(term => text.includes(term));
  });
}
export function readProjectSearchQuery(search: string): string {
  return (new URLSearchParams(search).get("q") ?? "").trim();
}
/** Keep unrelated link state without adding a history entry for every keypress. */
export function projectSearchHref(href: string, query: string): string {
  const next = new URL(href);
  next.searchParams.delete("q");
  if (query.trim()) next.searchParams.set("q",query.trim());
  return next.pathname + next.search + next.hash;
}
