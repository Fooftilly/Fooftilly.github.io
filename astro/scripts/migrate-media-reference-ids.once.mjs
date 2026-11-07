/** ONE-TIME, branch-only data migration.
 * Only a verified direct platform URL with a standard provider label is
 * shortened. Other links, private ratings, notes, and identities never change.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const write = process.argv.length===3&&process.argv[2]==="--write";
if (process.argv.length>2&&!write) throw Error("Usage: node migrate-media-reference-ids.once.mjs [--write]");
const root=resolve("content/media");
const providers=["imdb","tmdb","wikipedia","letterboxd","musicbrainz"];
const labels={imdb:"IMDb",tmdb:"TMDb",wikipedia:"Wikipedia",letterboxd:"Letterboxd",musicbrainz:"MusicBrainz"};
function asReference(link){
  if(!link||typeof link!=="object"||typeof link.label!=="string"||typeof link.url!=="string")return null;
  const url=link.url;
  let m;
  if(link.label==="IMDb"&&(m=/^https:\/\/www\.imdb\.com\/title\/(tt[0-9]{7,})\/$/.exec(url)))
    return ["imdb",m[1]];
  if(link.label==="TMDb"&&(m=/^https:\/\/www\.themoviedb\.org\/(movie|tv)\/([1-9][0-9]*)$/.exec(url)))
    return ["tmdb",m[1]+":"+m[2]];
  if(link.label==="Letterboxd"&&(m=/^https:\/\/boxd\.it\/([A-Za-z0-9]{2,16})$/.exec(url)))
    return ["letterboxd",m[1]];
  if(link.label==="MusicBrainz"&&(m=/^https:\/\/musicbrainz\.org\/release-group\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/.exec(url)))
    return ["musicbrainz",m[1]];
  if(link.label==="Wikipedia"&&(m=/^https:\/\/([a-z]{2,12})\.wikipedia\.org\/wiki\/([^?#]+)$/.exec(url))){
    let title;
    try{title=decodeURIComponent(m[2]);}catch{return null;}
    if(title.length>220||/[\/\\?#\x00-\x1f]/.test(title)||encodeURIComponent(title)!==m[2])return null;
    return ["wikipedia",m[1]+":"+title];
  }
  return null;
}
function urlOf(provider,id){
  switch(provider){
    case "imdb":return "https://www.imdb.com/title/"+id+"/";
    case "tmdb":{const [kind,num]=id.split(":");return "https://www.themoviedb.org/"+kind+"/"+num;}
    case "wikipedia":{const [lang,...parts]=id.split(":");return "https://"+lang+".wikipedia.org/wiki/"+encodeURIComponent(parts.join(":"));}
    case "letterboxd":return "https://boxd.it/"+id;
    case "musicbrainz":return "https://musicbrainz.org/release-group/"+id;
    default:throw Error("Unknown provider");
  }
}
function expanded(record){
  return [
    ...providers.flatMap(p=>record.refs?.[p]?[{label:labels[p],url:urlOf(p,record.refs[p])}]:[]),
    ...(record.links??[]),
  ];
}
function fingerprint(record){
  return expanded(record).map(x=>JSON.stringify([x.label,x.url])).sort().join("\n");
}
let examined=0,changed=0,linksConverted=0,unchanged=0;
const pending=[];
for(const category of ["films","music","tv"]){
  for(const file of (await readdir(join(root,category))).filter(x=>x.endsWith(".json")).sort()){
    const path=join(root,category,file);
    const original=JSON.parse(await readFile(path,"utf8"));
    examined++;
    if(!Array.isArray(original.links)||!original.links.length){unchanged++;continue;}
    const before=fingerprint(original);
    const refs={...original.refs};
    const remainder=[];
    let converted=0;
    for(const link of original.links){
      const result=asReference(link);
      if(result && refs[result[0]]===undefined && urlOf(result[0],result[1])===link.url){
        refs[result[0]]=result[1];converted++;
      }else remainder.push(link);
    }
    if(!converted){unchanged++;continue;}
    const updated={...original,refs};
    if(remainder.length)updated.links=remainder;
    else delete updated.links;
    if(fingerprint(updated)!==before)throw Error("Source URL/label changed for "+path);
    if(Object.keys(updated).some(k=>!Object.keys(original).includes(k)&&k!=="refs"))
      throw Error("New unexpected field in "+path);
    pending.push({path,content:JSON.stringify(updated,null,2)+"\n"});
    changed++;linksConverted+=converted;
  }
}
if(write)for(const item of pending)await writeFile(item.path,item.content,"utf8");
process.stdout.write(JSON.stringify({examined,changed,linksConverted,unchanged,write})+"\n");
