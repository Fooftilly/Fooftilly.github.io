/** ONE-TIME public MusicBrainz subtype audit. Do not publish this utility.
 * Reads only already-selected public album JSON, never original RYM exports.
 * Re-query by verified release-group IDs in bounded public API requests.
 */
import {readdir,readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import {setTimeout as sleep} from "node:timers/promises";

const dir=resolve("content/media/music"),items=[];
for(const name of (await readdir(dir)).filter(x=>x.endsWith(".json")).sort()){
 const r=JSON.parse(await readFile(join(dir,name),"utf8"));
 if(!r.refs?.musicbrainz||!r.rating||r.kind!=="music")throw Error("Unexpected incomplete album "+name);
 items.push({path:"content/media/music/"+name,id:r.refs.musicbrainz});
}
const known=new Map(items.map(x=>[x.id,x]));
if(known.size!==items.length)throw Error("Duplicate MusicBrainz release-group identifiers");
const flagged={};const unexpected=[];
async function request(ids){
 const search="rgid:("+ids.join(" OR ")+")";
 const url="https://musicbrainz.org/ws/2/release-group/?query="+encodeURIComponent(search)+"&fmt=json&limit=100";
 for(let attempt=0;attempt<3;attempt++){
  let response;
  try{
   response=await fetch(url,{headers:{
      "User-Agent":"Fooftilly-Media-Import/0.1 (https://github.com/Fooftilly/Fooftilly.github.io)",
      "Accept":"application/json"
    },signal:AbortSignal.timeout(20000)});
  }catch(e){if(attempt===2)throw e;await sleep(1500*(attempt+1));continue;}
  if(response.ok)return response.json();
  if((response.status===429||response.status>=500)&&attempt<2){
   await sleep(1800*(attempt+1));continue;
  }
  throw Error("MusicBrainz returned "+response.status);
 }
 throw Error("MusicBrainz retry limit exceeded");
}
for(let i=0;i<items.length;i+=20){
 const block=items.slice(i,i+20);
 const data=await request(block.map(x=>x.id));
 const groups=data["release-groups"]??[];
 if(data.count!==block.length||groups.length!==block.length)
   throw Error("MusicBrainz incomplete ID lookup: "+i+" expected "+block.length+" received "+data.count+"/"+groups.length);
 const found=new Set(groups.map(x=>x.id));
 if(block.some(x=>!found.has(x.id)))throw Error("MusicBrainz omitted an imported release-group ID");
 for(const g of groups){
  const item=known.get(g.id);
  if(!item)throw Error("Unknown release-group returned");
  if(g["primary-type"]!=="Album")unexpected.push({path:item.path,type:g["primary-type"]??"unknown"});
  for(const type of g["secondary-types"]??[]){
   (flagged[type]??=[]).push(item.path);
  }
 }
 await sleep(1250);
}
process.stdout.write("ALBUM_SUBTYPE_AUDIT "+JSON.stringify({
  inspected:items.length,primaryNotAlbum:unexpected,
  secondary:Object.fromEntries(Object.entries(flagged).map(([key,paths])=>[key,{count:paths.length,paths}]))
})+"\n");
