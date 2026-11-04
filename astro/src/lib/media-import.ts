/** Optional bulk import adapters. RYM/Letterboxd never own the website IDs. */
import { mediaPath, sameMedia, validateMediaLink, validateMediaRecord,
         type MediaKind, type MediaRecord } from "./media-model.ts";
const MAX_ROWS=50000;
const MAX_CHARS=15_000_000;
const MAX_FIELD=100000;
export function parseCsv(text: string): string[][] {
  if (text.length > MAX_CHARS) throw new Error("CSV exceeds 15 MB safety limit");
  const csv = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let justClosed = false;
  const column = () => { row.push(field.trim()); field = ""; justClosed = false; };
  const line = () => {
    column();
    if (row.some(value => value.length > 0)) rows.push(row);
    if (rows.length > MAX_ROWS + 1) throw new Error("CSV exceeds 50,000 records");
    row = [];
  };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; justClosed = true; }
      } else field += char;
    } else if (char === ",") column();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      line();
    } else if (char === '"') {
      if (field.length > 0 || justClosed) throw new Error("Malformed CSV quote at row " + (rows.length + 1));
      quoted = true;
    } else if (justClosed) {
      if (char !== " " && char !== "\t") throw new Error("Unexpected character after CSV quote at row " + (rows.length + 1));
    } else field += char;
    if (field.length > MAX_FIELD) throw new Error("CSV field exceeds 100000 characters");
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (field || row.length || justClosed) line();
  return rows;
}

export type MediaProvider = "rym" | "letterboxd";
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
const first=(row:Map<string,string>,...fields:string[]) =>
  fields.map(field=>row.get(normalize(field))??"").find(value=>value.trim())?.trim()??"";
const yearOf=(value:string):number|undefined=>{
  if(!value.trim())return undefined;
  const match=value.match(/(?:^|\D)((?:18|19|20|21)\d{2})(?:\D|$)/);
  if(!match)throw Error("Invalid release year "+value.slice(0,40));
  return Number(match[1]);
};
const externalLink=(source:MediaProvider,value:string)=>{
  if(!value.trim())return undefined;
  const link=validateMediaLink({label:source==="rym"?"Rate Your Music":"Letterboxd",url:value});
  const host=new URL(link.url).hostname.toLowerCase();
  if(source==="rym"&&!["rateyourmusic.com","www.rateyourmusic.com"].includes(host))
    throw Error("RYM export included a link to another domain");
  if(source==="letterboxd"&&!["letterboxd.com","www.letterboxd.com","boxd.it"].includes(host))
    throw Error("Letterboxd export included a link to another domain");
  return link;
};
function starsFrom(raw:string,source:MediaProvider):number|undefined{
  if(!raw.trim())return undefined;
  const n=Number(raw);
  if(source==="rym"){
    if(!Number.isInteger(n)||n<0||n>10)throw Error("RYM score must be an integer 0–10");
    return n===0?undefined:n/2;
  }
  if(n<0.5||n>5||!Number.isInteger(n*2))throw Error("Letterboxd score must be 0.5–5 in half-star increments");
  return n;
}
export function parseMediaCsv(text:string,kind:MediaKind,provider:MediaProvider):MediaRecord[]{
  if(!["music","films"].includes(kind))throw Error("Import this media category with the manual website editor");
  if(provider==="letterboxd"&&kind!=="films")throw Error("Letterboxd CSV supports films only");
  const rows=parseCsv(text);
  if(rows.length<2)throw Error("CSV must have headers and at least one data row");
  const columns=rows[0].map(normalize);
  if(columns.some(x=>!x)||new Set(columns).size!==columns.length)throw Error("Duplicate or empty CSV column header");
  if(!columns.includes("rating"))throw Error("CSV must include a Rating column");
  if(provider==="rym"&&!columns.includes("title"))throw Error("RYM export must include Title");
  if(provider==="letterboxd"&&!columns.includes("name")&&!columns.includes("title"))
    throw Error("Letterboxd export must include Name or Title");
  if(provider==="rym"&&kind==="music"&&!["artist","lastname","lastnamelocalized"].some(c=>columns.includes(c)))
    throw Error("RYM music export needs Artist or Last Name");
  const items:MediaRecord[]=[];
  for(let i=1;i<rows.length;i++){
    const cells=rows[i];
    if(cells.length!==columns.length)throw Error("CSV row "+(i+1)+": mismatched number of columns");
    const row=new Map(columns.map((key,i)=>[key,cells[i]]));
    try{
      const rating=starsFrom(first(row,"Rating"),provider);
      if(rating===undefined)continue; // Unrated catalog items do not become invented ratings.
      const title=first(row,provider==="rym"?"Title":"Name","Title");
      let creator=first(row,kind==="music"?"Artist":"Director");
      if(!creator&&kind==="music")creator=[
        first(row,"First Name localized","First Name"),
        first(row,"Last Name localized","Last Name"),
      ].filter(Boolean).join(" ").trim();
      const year=yearOf(first(row,"Release_Date","Year"));
      const link=externalLink(provider,first(row,"Letterboxd URI","RYM URL","URL"));
      const entry:MediaRecord={schema:1,kind,title,rating,status:"finished"};
      if(creator)entry.creator=creator;
      if(year!==undefined)entry.year=year;
      if(link)entry.links=[link];
      items.push(validateMediaRecord(entry,kind));
    }catch(error){
      throw Error("CSV row "+(i+1)+": "+(error instanceof Error?error.message:String(error)));
    }
  }
  if(!items.length)throw Error("Export contains no rated items");
  const paths=new Set<string>();
  const unique:MediaRecord[]=[];
  for(const item of items){
    const path=mediaPath(item).toLowerCase();
    if(paths.has(path)||unique.some(other=>sameMedia(other,item))) throw Error("Duplicate media entry in export: "+item.title);
    paths.add(path);unique.push(item);
  }
  return unique.sort((a,b)=>a.kind.localeCompare(b.kind)||a.title.localeCompare(b.title)||((a.year??0)-(b.year??0)));
}
