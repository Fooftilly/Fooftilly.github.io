/** Recognize only single-video YouTube destinations, not playlists/search URLs.
 * No third-party player, thumbnail, or API request is made while parsing.
 */
const VIDEO_ID=/^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS=new Set(["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com"]);
const SHORT_HOSTS=new Set(["youtu.be","www.youtu.be"]);

export function youtubeVideoId(raw: string): string | null {
  let url: URL;
  try { url=new URL(raw); } catch { return null; }
  if(url.protocol!=="https:" || url.username || url.password || url.port || url.hash.startsWith("#/")) return null;
  const host=url.hostname.toLowerCase();
  let id:string|null=null;
  if(SHORT_HOSTS.has(host)){
    const match=/^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    id=match?.[1]??null;
  }else if(YOUTUBE_HOSTS.has(host)){
    if(url.pathname==="/watch"){
      const ids=url.searchParams.getAll("v");
      if(ids.length===1)id=ids[0];
    }else{
      const match=/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
      id=match?.[1]??null;
    }
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

export function youtubeEmbedUrl(id:string):string {
  if(!VIDEO_ID.test(id))throw new Error("Invalid YouTube video ID");
  return "https://www.youtube-nocookie.com/embed/"+id;
}

/** Privacy boundary: create no remote frame until the visitor opts in. */
export function mountConsentYouTube(root: ParentNode = document):void {
  for(const section of root.querySelectorAll<HTMLElement>("[data-youtube-consent]")){
    const button=section.querySelector<HTMLButtonElement>("[data-load-youtube]");
    const container=section.querySelector<HTMLElement>("[data-youtube-container]");
    const id=section.dataset.youtubeVideoId;
    if(!button||!container||!id||!VIDEO_ID.test(id))continue;
    button.addEventListener("click",()=>{
      if(container.querySelector("iframe"))return;
      const iframe=document.createElement("iframe");
      iframe.src=youtubeEmbedUrl(id);
      iframe.title="YouTube video: "+(section.dataset.youtubeTitle??"Video");
      iframe.width="560";
      iframe.height="315";
      iframe.loading="lazy";
      iframe.referrerPolicy="no-referrer";
      iframe.allow="encrypted-media; picture-in-picture";
      iframe.allowFullscreen=true;
      iframe.dataset.youtubePlayer="true";
      container.appendChild(iframe);
      button.setAttribute("aria-expanded","true");
      button.hidden=true;
    },{once:true});
  }
}
