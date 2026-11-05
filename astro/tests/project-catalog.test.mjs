import test from "node:test";
import assert from "node:assert/strict";
import {projectPath,sortProjects} from "../src/lib/project-catalog.ts";

test("project slugs are strict, lowercase and safe for public routes",()=>{
  assert.equal(projectPath("local-search-mcp"),"/projects/local-search-mcp/");
  for(const unsafe of ["../x","UPPER","project/x","","--x","hello world","x?y=1"]){
    assert.throws(()=>projectPath(unsafe),/Invalid project slug/);
  }
});

test("adding a fourth project requires content only, not custom routing code",()=>{
  const entries=[
    {id:"prks",data:{title:"PRKS",order:1}},
    {id:"future-project",data:{title:"Future",order:4}},
    {id:"kokoro-extension",data:{title:"Kokoro",order:2}},
    {id:"local-search-mcp",data:{title:"MCP",order:3}},
  ];
  assert.deepEqual(sortProjects(entries).map(x=>projectPath(x.id)),[
    "/projects/prks/","/projects/kokoro-extension/",
    "/projects/local-search-mcp/","/projects/future-project/",
  ]);
  assert.equal(entries[1].id,"future-project","sorting does not mutate source");
});
