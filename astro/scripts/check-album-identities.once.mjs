/** ONE-TIME album import validation and lossless MusicBrainz URL compaction.
 * The original user export is never accessed by Actions. Only already reviewed
 * public album JSON is examined. No album metadata or ratings are changed.
 */
import { readdir,readFile,writeFile } from "node:fs/promises";
import { join,resolve } from "node:path";

const write=process.argv.length===3&&process.argv[2]==="--write";
if(process.argv.length>2&&!write)throw Error("Usage: node check-album-identities.once.mjs [--write]");
const root=resolve("content/media/music");
const mb=/^https:\/\/musicbrainz\.org\/release-group\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/;
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ids=new Map(),pending=[];let records=0,converted=0;
for(const file of (await readdir(root)).filter(x=>x.endsWith(".json")).sort()){
 const path=join(root,file),item=JSON.parse(await readFile(path,"utf8"));records++;
 if(item.schema!==1||item.kind!=="music"||typeof item.title!=="string"||
    typeof item.creator!=="string"||!Number.isInteger(item.year)||
    !Number.isFinite(item.rating)||item.rating<0.5||item.rating>5||
    !Number.isInteger(item.rating*2)||"notes"in item||"tracks"in item)throw Error("Unreviewed music metadata in "+file);
 if(item.refs&&Object.keys(item.refs).some(k=>k!=="musicbrainz"))throw Error("Unexpected source ref "+file);
 const list=Array.isArray(item.links)?item.links:[];
 const matches=list.filter(x=>x.label==="MusicBrainz"&&mb.test(x.url));
 if(matches.length>1)throw Error("Multiple MusicBrainz links in "+file);
 let id=item.refs?.musicbrainz;
 if(id&&!uuid.test(id))throw Error("Invalid compact release group ID: "+file);
 if(id&&matches.length)throw Error("Mixed direct and compact release groups: "+file);
 if(!id&&matches.length===1)id=mb.exec(matches[0].url)[1];
 if(!id)throw Error("Album has no uniquely verified MusicBrainz release group "+file);
 if(ids.has(id))throw Error("Two media records share MusicBrainz release-group "+id+": "+ids.get(id)+" and "+file);
 ids.set(id,file);
 if(matches.length){
   const updated={...item,refs:{musicbrainz:id}};
   const remaining=list.filter(x=>x!==matches[0]);
   if(remaining.length)updated.links=remaining;else delete updated.links;
   const urlsOld=[...list.map(x=>[x.label,x.url])].sort();
   const urlsNew=[["MusicBrainz","https://musicbrainz.org/release-group/"+id],...remaining.map(x=>[x.label,x.url])].sort();
   if(JSON.stringify(urlsOld)!==JSON.stringify(urlsNew))throw Error("Link changed during conversion: "+file);
   pending.push({path,content:JSON.stringify(updated,null,2)+"\n"});
   converted++;
 }
}
if(write)for(const item of pending)await writeFile(item.path,item.content,"utf8");
process.stdout.write(JSON.stringify({records,uniqueReleaseGroups:ids.size,converted,write})+"\n");
