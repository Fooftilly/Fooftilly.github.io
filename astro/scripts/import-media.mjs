/** Owner-run importer: strict, offline, preview by default and non-overwriting.
 * Example: node scripts/import-media.mjs music ~/Downloads/rym.csv rym --write
 */
import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMediaCsv } from "../src/lib/media-import.ts";
import { mediaPath, sameMedia, validateMediaRecord } from "../src/lib/media-model.ts";

const ROOT=fileURLToPath(new URL("../../",import.meta.url));
const [kind,sourcePath,provider,...flags]=process.argv.slice(2);
if(!["music","films"].includes(kind)||!sourcePath||!["rym","letterboxd"].includes(provider)||
   flags.some(value=>value!=="--write")||flags.length>1){
  console.error("Usage: node scripts/import-media.mjs music|films /path/to/export.csv rym|letterboxd [--write]");
  process.exitCode=2;
}else{
  const raw=await readFile(resolve(sourcePath));
  if(raw.byteLength>15_000_000)throw Error("Export exceeds 15 MB safety limit");
  // Never use Buffer.toString() for catalog imports: it silently corrupts
  // Windows-1252 and invalid UTF-8 names with replacement characters.
  const csv=new TextDecoder("utf-8",{fatal:true}).decode(raw);
  const imported=parseMediaCsv(csv,kind,provider);
  const base=join(ROOT,"content/media");
  const previous=[];
  for(const folder of ["music","films","tv"]){
    for(const name of await readdir(join(base,folder))){
      if(!name.endsWith(".json"))continue;
      const path="content/media/"+folder+"/"+name;
      const record=validateMediaRecord(JSON.parse(await readFile(join(ROOT,path),"utf8")),folder);
      previous.push({path,record});
    }
  }
  const queue=[];
  let unchanged=0;
  for(const record of imported){
    const path=mediaPath(record);
    const expected=JSON.stringify(record,null,2)+"\n";
    const conflict=previous.find(item=>item.path.toLowerCase()===path.toLowerCase()||sameMedia(item.record,record)||
      Boolean(item.record.links?.some(a=>record.links?.some(b=>a.url===b.url))));
    if(conflict){
      const existingText=await readFile(join(ROOT,conflict.path),"utf8");
      if(conflict.path===path && existingText===expected){unchanged++;continue;}
      throw Error("Existing media record needs manual review: "+conflict.path+" (import: "+path+"). No files have been written.");
    }
    if(queue.some(item=>item.path.toLowerCase()===path.toLowerCase()))throw Error("Duplicate generated path "+path);
    queue.push({path,content:expected});
  }
  console.log(imported.length+" rated export rows, "+unchanged+" already present, "+queue.length+" new records");
  console.log(flags.includes("--write")?"Writing new files after duplicate checks":"Preview only. Add --write to create new records.");
  if(!flags.includes("--write")){
    for(const item of queue.slice(0,8))console.log("  NEW "+item.path);
    if(queue.length>8)console.log("  ... and "+(queue.length-8)+" more");
  }else{
    const written=[];
    try{
      for(const item of queue){
        const target=join(ROOT,item.path);
        await mkdir(dirname(target),{recursive:true});
        await writeFile(target,item.content,{flag:"wx"});
        written.push(target);
      }
      console.log("Wrote "+written.length+" files. Review git diff before committing any public media.");
    }catch(error){
      await Promise.all(written.map(path=>unlink(path)));
      throw Error("Import failed and newly created files were rolled back: "+String(error));
    }
  }
  console.log("Raw source CSV stays local. Nothing was committed or published.");
}
