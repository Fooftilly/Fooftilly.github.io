import test from "node:test";
import assert from "node:assert/strict";
import { youtubeVideoId, youtubeEmbedUrl, mountConsentYouTube } from "../src/lib/youtube-embed.ts";

const id="7OeKYOJOp7o";
test("recognizes a single source-owned YouTube video without guessing IDs",()=>{
  for(const link of [
    "https://www.youtube.com/watch?v="+id,
    "https://youtube.com/watch?feature=share&v="+id+"&t=36",
    "https://m.youtube.com/watch?v="+id,
    "https://music.youtube.com/watch?v="+id,
    "https://youtu.be/"+id,
    "https://www.youtube.com/shorts/"+id,
    "https://www.youtube.com/live/"+id+"?feature=share",
    "https://www.youtube.com/embed/"+id,
  ]) assert.equal(youtubeVideoId(link),id,link);
  assert.equal(youtubeEmbedUrl(id),"https://www.youtube-nocookie.com/embed/"+id);
});

test("rejects non-video routes and attacker-controlled hostnames/IDs",()=>{
  for(const link of [
    "https://youtube.com/playlist?list=PL123",
    "https://youtube.com/results?search_query=kafka",
    "https://youtube.com/watch?v=bad",
    "https://youtube.com/watch?v="+id+"&v=another",
    "https://youtube.com/watch?v="+id+"extra",
    "https://youtube.com.evil.example/watch?v="+id,
    "https://evil-youtu.be/"+id,
    "http://www.youtube.com/watch?v="+id,
    "https://user:password@www.youtube.com/watch?v="+id,
    "https://www.youtube.com:8443/watch?v="+id,
    "https://youtu.be/"+id+"/extra",
    "https://youtu.be/%2e%2e",
    "javascript:alert(1)",
    "",
  ])assert.equal(youtubeVideoId(link),null,link);
  for(const bad of ["",id+"/evil","../../evil","x".repeat(11)+"?start=1"])
    assert.throws(()=>youtubeEmbedUrl(bad),/Invalid YouTube video ID/);
});

test("mount does not contact YouTube until an explicit visitor click",()=>{
  let listener;
  const frames=[];
  const button={hidden:false,attributes:{},
    addEventListener(type,callback){assert.equal(type,"click");listener=callback;},
    setAttribute(name,value){this.attributes[name]=value;}};
  const container={querySelector(){return frames[0]??null;},appendChild(frame){frames.push(frame);}};
  const section={dataset:{youtubeVideoId:id,youtubeTitle:"Kafka"},
    querySelector(selector){return selector==="[data-load-youtube]"?button:container;}};
  const root={querySelectorAll(){return [section]}};
  const original=globalThis.document;
  globalThis.document={createElement(tag){assert.equal(tag,"iframe");return {dataset:{}};}};
  try{
    mountConsentYouTube(root);
    assert.deepEqual(frames,[],"No third-party iframe exists before consent");
    assert.equal(typeof listener,"function");
    listener();
    assert.equal(frames.length,1);
    assert.equal(frames[0].src,"https://www.youtube-nocookie.com/embed/"+id);
    assert.equal(frames[0].referrerPolicy,"no-referrer");
    assert.equal(frames[0].allowFullscreen,true);
    assert.equal(button.attributes["aria-expanded"],"true");
    assert.equal(button.hidden,true);
    listener();
    assert.equal(frames.length,1);
  }finally{
    if(original===undefined)delete globalThis.document;
    else globalThis.document=original;
  }
});
