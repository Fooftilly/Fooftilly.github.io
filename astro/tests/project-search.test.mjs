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
