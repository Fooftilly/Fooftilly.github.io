import test from "node:test";
import assert from "node:assert/strict";
import { filterProjects, readProjectSearchQuery, projectSearchHref } from "../src/lib/project-search.ts";

const records=[
  {id:"one",title:"Café projects",summary:"Full text research",summarySh:"Istraživanje tekstova",tags:["TypeScript","Local-first"],repository:"https://github.com/Fooftilly/one",status:"Work in progress"},
  {id:"two",title:"Speech tools",summary:"Audio reading",tags:["Vue","TypeScript"],repository:"https://github.com/Fooftilly/two",status:"Maintained"},
  {id:"three",title:"Other",summary:"Separate project",tags:["Rust"],repository:"https://github.com/Fooftilly/three",status:"Archived"},
];

test("project search combines text terms from current titles, tags, descriptions and translations",()=>{
  assert.deepEqual(filterProjects(records,"cafe").map(x=>x.id),["one"]);
  assert.deepEqual(filterProjects(records,"typescript").map(x=>x.id),["one","two"]);
  assert.deepEqual(filterProjects(records,"ISTRAZIVANJE tekstova").map(x=>x.id),["one"]);
  assert.deepEqual(filterProjects(records,"typescript speech").map(x=>x.id),["two"]);
  assert.deepEqual(filterProjects(records,"nonexistent"),[]);
  assert.deepEqual(filterProjects(records,"").map(x=>x.id),["one","two","three"]);
});
test("search never mutates the source ordering or depends on initial catalog size",()=>{
  const copy=structuredClone(records);
  assert.deepEqual(filterProjects(records.slice(0,1),"vue"),[]);
  assert.deepEqual(filterProjects([], "test"),[]);
  assert.deepEqual(records,copy);
});
test("shareable project search preserves unrelated parameters and fragments",()=>{
  assert.equal(readProjectSearchQuery("?q=%20Caf%C3%A9%20"),"Café");
  const href=projectSearchHref("https://www.peroniko.xyz/sh/projects/?q=old&utm=public#projects","TypeScript Vue");
  const url=new URL(href,"https://www.peroniko.xyz");
  assert.equal(url.pathname,"/sh/projects/");
  assert.equal(url.searchParams.get("q"),"TypeScript Vue");
  assert.equal(url.searchParams.get("utm"),"public");
  assert.equal(url.hash,"#projects");
  const empty=projectSearchHref(url.href,"");
  assert.equal(new URL(empty,"https://www.peroniko.xyz").searchParams.has("q"),false);
});

test("search matches the SH status shown on the actual project card", async()=>{
  const { projectStatusLabel } = await import("../src/lib/project-search.ts");
  assert.equal(projectStatusLabel("Work in progress","sh"),"U razvoju");
  assert.equal(projectStatusLabel("Maintained","sh"),"Aktivno");
  assert.equal(projectStatusLabel("Archived","sh"),"Arhivirano");
  assert.deepEqual(filterProjects(records,"U razvoju").map(x=>x.id),["one"]);
  assert.deepEqual(filterProjects(records,"AKTIVNO").map(x=>x.id),["two"]);
  assert.deepEqual(filterProjects(records,"Arhivirano").map(x=>x.id),["three"]);
});

test("project labels provide exact shareable tag filtering without title false positives", async () => {
  const {readProjectTag,projectTagHref} = await import("../src/lib/project-search.ts");
  const subset=filterProjects(records,"","typescript");
  assert.deepEqual(subset.map(item=>item.id),["one","two"]);
  assert.deepEqual(filterProjects(records,"Speech","TypeScript").map(item=>item.id),["two"]);
  assert.deepEqual(filterProjects(records,"","Café projects"),[]);
  assert.deepEqual(filterProjects(records,"","Rust").map(item=>item.id),["three"]);
  const labels=records.flatMap(item=>item.tags);
  assert.equal(readProjectTag("?tag=typesCRIPT",labels),"TypeScript");
  assert.equal(readProjectTag("?tag=deprecated",labels),"");
  assert.equal(projectTagHref("Local-first","sh"),"/sh/projects/?tag=Local-first");
  const href=projectSearchHref("https://www.peroniko.xyz/projects/?tag=stale&q=old#main","Vue","TypeScript");
  const u=new URL(href,"https://www.peroniko.xyz");
  assert.deepEqual(u.searchParams.getAll("tag"),["TypeScript"]);
  assert.equal(u.hash,"#main");
  assert.equal(new URL(projectSearchHref(u.href,"",""),"https://www.peroniko.xyz").searchParams.has("tag"),false);
});
