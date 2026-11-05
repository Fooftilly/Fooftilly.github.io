/** Validated, Git-owned projects; no runtime GitHub API or backend. */
export const PROJECT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function projectPath(slug: string): string {
  if (!PROJECT_SLUG.test(slug)) throw new Error("Invalid project slug: "+slug);
  return "/projects/"+slug+"/";
}

export function sortProjects<T extends {id:string;data:{order:number;title:string}}>(items:readonly T[]):T[] {
  const sorted=[...items].sort((a,b)=>a.data.order-b.data.order
    || a.data.title.localeCompare(b.data.title,"en",{sensitivity:"base"})
    || a.id.localeCompare(b.id));
  for (let i=0;i<sorted.length;i++) projectPath(sorted[i].id);
  return sorted;
}
