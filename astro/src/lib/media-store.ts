import { getCollection } from "astro:content";
import { validateMediaRecord, type MediaKind, type StoredMedia } from "./media-model.ts";
/** Git-managed JSON media entries are the only canonical website records.
 * RYM and Letterboxd are optional import/export links; the build works offline.
 */
export async function loadMedia(kind?:MediaKind):Promise<StoredMedia[]>{
  const entries=await getCollection("media");
  const items=entries.map(entry=>{
    const [folder,slug,...rest]=entry.id.split("/");
    if(rest.length||!["music","films","tv"].includes(folder)||!slug || !/^[\p{L}\p{N}-]+$/u.test(slug))
      throw new Error("Invalid repository media path "+entry.id);
    const record=validateMediaRecord(entry.data,folder as MediaKind);
    return {...record,id:entry.id,path:"content/media/"+entry.id+".json"};
  }).filter(item=>!kind||item.kind===kind);
  const byPath=new Set<string>();
  for(const item of items){
    if(byPath.has(item.path.toLowerCase())) throw new Error("Duplicate media path: "+item.path);
    byPath.add(item.path.toLowerCase());
  }
  return items.sort((a,b)=>(b.rating??-1)-(a.rating??-1)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
