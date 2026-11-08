<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { compactMediaLinks, composeMediaDraft, githubMediaEditorUrl, mediaSourceLabel, type ExistingMediaRef, type MediaKind, type MediaRecord } from "../lib/media-model.ts";
import { nextAvailableMediaPosition } from "../lib/media-editor-positions.ts";

const props=defineProps<{existing:ExistingMediaRef[]}>();
const kind=ref<MediaKind>("films");
onMounted(() => {
  // Category-page links may preselect a kind, but the URL is untrusted.
  const requested = new URLSearchParams(window.location.search).get("kind");
  if (requested === "music" || requested === "tv" || requested === "films") {
    kind.value = requested;
  }
});
const title=ref("");
const edition=ref("");
const creator=ref("");
const year=ref<string|number>("");
const rating=ref(0); // 0 means no rating; saved values are 0.5 through 5.
const ratingSlider=ref<HTMLInputElement|null>(null);
async function clearRating():Promise<void> {
  rating.value=0;
  // The Clear button disappears at zero, so restore focus to the slider.
  await nextTick();
  ratingSlider.value?.focus();
}
const ratingText=computed(()=>rating.value===0?"Not rated":`${rating.value.toFixed(1)} / 5`);
const ratingAriaText=computed(()=>rating.value===0?"Not rated":`${rating.value} out of 5 stars`);
const kindOptions:{value:MediaKind;label:string}[]=[
  {value:"films",label:"Film"},
  {value:"tv",label:"TV series"},
  {value:"music",label:"Music"},
];
const statusOptions:{value:""|"finished"|"in-progress"|"planned";label:string}[]=[
  {value:"",label:"Not specified"},
  {value:"finished",label:"Finished"},
  {value:"in-progress",label:"In progress"},
  {value:"planned",label:"Planned"},
];
const status=ref<""|"finished"|"in-progress"|"planned">("");
const notes=ref("");
// Optional nested scores are explicit user inputs, not calculated from the album/series rating.
type Position = string | number;
type TrackDraft = {disc:Position;number:Position;title:string;rating:number};
type EpisodeDraft = {number:Position;title:string;rating:number};
type SeasonDraft = {number:Position;title:string;rating:number;episodes:EpisodeDraft[]};
const tracks=ref<TrackDraft[]>([]);
const seasons=ref<SeasonDraft[]>([]);
const numberOf=(value:Position,label:string):number=>{
  const text=String(value??"").trim();
  if(!/^\d+$/.test(text))throw new Error(label+" must be a nonnegative integer");
  return Number(text);
};
function addTrack():void {
  const disc=1;
  const existing=tracks.value.filter(track=>Number(track.disc)===disc).map(track=>track.number);
  tracks.value.push({disc,number:nextAvailableMediaPosition(existing,250),title:"",rating:0});
}
function addSeason():void {
  seasons.value.push({
    number:nextAvailableMediaPosition(seasons.value.map(season=>season.number),200),
    title:"",rating:0,episodes:[],
  });
}
function addEpisode(season:SeasonDraft):void {
  season.episodes.push({
    number:nextAvailableMediaPosition(season.episodes.map(episode=>episode.number),1000),
    title:"",rating:0,
  });
}
const primaryUrl=ref("");
const secondaryUrl=ref("");
const outputStatus=ref("");
const editorLimit=3900;

const drafted=computed(()=>{
  try {
    const input:MediaRecord={schema:1,kind:kind.value,title:title.value.trim()};
    if(edition.value.trim()) input.edition=edition.value.trim();
    if(creator.value.trim()) input.creator=creator.value.trim();
    const yearText=String(year.value ?? "").trim();
    if(yearText){
      if(!/^\d{4}$/.test(yearText)) throw new Error("Year must be exactly four digits.");
      input.year=Number(yearText);
    }
    if(rating.value>0) input.rating=rating.value;
    if(status.value) input.status=status.value;
    if(notes.value.trim()) input.notes=notes.value.trim();
    const links=[];
    if(primaryUrl.value.trim()) links.push({
      label:mediaSourceLabel(primaryUrl.value.trim(),"Primary reference"),
      url:primaryUrl.value.trim()
    });
    if(secondaryUrl.value.trim()) links.push({
      label:mediaSourceLabel(secondaryUrl.value.trim(),"Additional reference"),
      url:secondaryUrl.value.trim()
    });
    if(links.length) Object.assign(input,compactMediaLinks(links));
    if(kind.value==="music" && tracks.value.length) input.tracks=tracks.value.map(track=>({
      disc:numberOf(track.disc,"Disc"),number:numberOf(track.number,"Track number"),
      title:track.title,
      ...(track.rating>0?{rating:track.rating}:{})
    }));
    if(kind.value==="tv" && seasons.value.length) input.seasons=seasons.value.map(season=>({
      number:numberOf(season.number,"Season number"),
      ...(season.title.trim()?{title:season.title.trim()}:{}),
      ...(season.rating>0?{rating:season.rating}:{}),
      ...(season.episodes.length?{episodes:season.episodes.map(episode=>({
        number:numberOf(episode.number,"Episode number"),
        ...(episode.title.trim()?{title:episode.title.trim()}:{}),
        ...(episode.rating>0?{rating:episode.rating}:{})
      }))}:{})
    }));
    return {value:composeMediaDraft(input,props.existing),error:""};
  } catch(error){
    return {value:null,error:error instanceof Error?error.message:"Invalid media entry"};
  }
});
const hasPathConflict=computed(()=>drafted.value.value?.duplicatePaths.some(p=>p.toLowerCase()===drafted.value.value?.path.toLowerCase())??false);
const githubHref=computed(()=>{
  const draft=drafted.value.value;
  if(!draft || draft.duplicatePaths.length) return "";
  const url=githubMediaEditorUrl(draft.path,draft.json);
  return url.length<editorLimit?url:"https://github.com/Fooftilly/Fooftilly.github.io/new/master";
});
const prefilled=computed(()=>!!drafted.value.value && !drafted.value.value.duplicatePaths.length &&
  githubMediaEditorUrl(drafted.value.value.path,drafted.value.value.json).length<editorLimit);

function editExistingUrl(path:string){
  if(!/^content\/media\/(music|films|tv)\/[\p{L}\p{N}-]+\.json$/u.test(path)) return "";
  return "https://github.com/Fooftilly/Fooftilly.github.io/edit/master/"+encodeURI(path);
}
async function copy(value:string,label:string){
  try {await navigator.clipboard.writeText(value);outputStatus.value=label+" copied.";}
  catch {outputStatus.value="Clipboard access unavailable. Select and copy the generated text manually.";}
}
</script>

<template>
  <section class="media-editor" aria-labelledby="media-editor-heading">
    <h1 id="media-editor-heading">Add a media entry</h1>
    <p>Create a film, series or album draft for GitHub review. Nothing is saved here.</p>

    <div class="fields">
      <fieldset class="choice-field">
        <legend>Media type</legend>
        <div class="choice-buttons" data-media-kinds>
          <button v-for="option in kindOptions" :key="option.value" type="button"
            :data-media-kind="option.value" :aria-pressed="kind===option.value"
            @click="kind=option.value">{{ option.label }}</button>
        </div>
      </fieldset>
      <label>Title
        <input v-model="title" type="text" maxlength="250" required placeholder="Title" autocomplete="off" />
      </label>
      <label>Edition or version (optional)
        <input v-model="edition" type="text" maxlength="120" autocomplete="off"
               placeholder="Part 1 · EMI 31C 016 06894" />
        <span class="field-hint">Only add a verified version, format or catalog number.</span>
      </label>
      <label>Artist, director, or creator (optional)
        <input v-model="creator" type="text" maxlength="500" placeholder="Who made it?" />
      </label>
      <div class="two-cols">
        <label>Release year (optional)
          <input v-model="year" type="number" inputmode="numeric" min="1800" max="2200" step="1" placeholder="2026" />
        </label>
        <fieldset class="choice-field rating-field">
          <legend>My rating (optional)</legend>
          <div class="rating-row">
            <div class="star-slider">
              <span class="stars" aria-hidden="true">
                <span class="stars-empty">★★★★★</span>
                <span class="stars-filled" :style="{width:(rating*20)+'%'}">★★★★★</span>
              </span>
              <input ref="ratingSlider" v-model.number="rating" data-media-rating type="range" min="0" max="5"
                step="0.5" aria-label="My rating" :aria-valuetext="ratingAriaText" />
            </div>
            <output class="rating-value" aria-live="polite">{{ ratingText }}</output>
            <button v-if="rating>0" class="clear-rating" type="button" @click="clearRating">Clear</button>
          </div>
          <p class="field-hint">Half-star steps; slide to 0 for no rating.</p>
        </fieldset>
      </div>
      <fieldset class="choice-field">
        <legend>Status (optional)</legend>
        <div class="choice-buttons" data-media-statuses>
          <button v-for="option in statusOptions" :key="option.value" type="button"
            :data-media-status="option.value" :aria-pressed="status===option.value"
            @click="status=option.value">{{ option.label }}</button>
        </div>
      </fieldset>
      <label>RYM, Letterboxd, or other reference URL (optional)
        <input v-model="primaryUrl" type="url" maxlength="2048" autocomplete="off" placeholder="https://..." />
      </label>
      <label>Another reference URL (optional)
        <input v-model="secondaryUrl" type="url" maxlength="2048" autocomplete="off" placeholder="https://..." />
      </label>
      <fieldset v-if="kind==='music'" class="choice-field nested-ratings" data-album-tracks>
        <legend>Album tracks (optional)</legend>
        <p class="field-hint">Add tracks you want to identify or rate. A track rating never changes the album rating.</p>
        <div v-for="(track,index) in tracks" :key="index" class="nested-entry">
          <div class="two-cols">
            <label>Disc
              <input v-model="track.disc" type="number" min="1" max="50" step="1" inputmode="numeric" />
            </label>
            <label>Track number
              <input v-model="track.number" type="number" min="1" max="250" step="1" inputmode="numeric" />
            </label>
          </div>
          <label>Track title
            <input v-model="track.title" type="text" maxlength="250" placeholder="Track name" />
          </label>
          <label>Track rating (optional)
            <input v-model.number="track.rating" type="range" min="0" max="5" step="0.5"
                   :aria-valuetext="track.rating===0?'Not rated':track.rating+' out of 5 stars'" />
            <output>{{ track.rating===0?'Not rated':track.rating.toFixed(1)+' / 5' }}</output>
          </label>
          <button type="button" class="edit-nested" @click="tracks.splice(index,1)">Remove track</button>
        </div>
        <button type="button" class="edit-nested" data-add-track @click="addTrack">Add track</button>
      </fieldset>
      <fieldset v-if="kind==='tv'" class="choice-field nested-ratings" data-tv-seasons>
        <legend>Seasons and episodes (optional)</legend>
        <p class="field-hint">Season 0 is for specials. Episode numbers restart within each season. Scores are independent.</p>
        <section v-for="(season,index) in seasons" :key="index" class="nested-entry">
          <div class="two-cols">
            <label>Season number
              <input v-model="season.number" type="number" min="0" max="200" step="1" inputmode="numeric" />
            </label>
            <label>Season title (optional)
              <input v-model="season.title" type="text" maxlength="250" placeholder="Season or anime arc" />
            </label>
          </div>
          <label>Season rating (optional)
            <input v-model.number="season.rating" type="range" min="0" max="5" step="0.5"
                   :aria-valuetext="season.rating===0?'Not rated':season.rating+' out of 5 stars'" />
            <output>{{ season.rating===0?'Not rated':season.rating.toFixed(1)+' / 5' }}</output>
          </label>
          <div v-for="(episode,episodeIndex) in season.episodes" :key="episodeIndex" class="nested-entry episode-entry">
            <div class="two-cols">
              <label>Episode number
                <input v-model="episode.number" type="number" min="1" max="1000" step="1" inputmode="numeric" />
              </label>
              <label>Episode title (optional)
                <input v-model="episode.title" type="text" maxlength="250" />
              </label>
            </div>
            <label>Episode rating (optional)
              <input v-model.number="episode.rating" type="range" min="0" max="5" step="0.5"
                     :aria-valuetext="episode.rating===0?'Not rated':episode.rating+' out of 5 stars'" />
              <output>{{ episode.rating===0?'Not rated':episode.rating.toFixed(1)+' / 5' }}</output>
            </label>
            <button type="button" class="edit-nested" @click="season.episodes.splice(episodeIndex,1)">Remove episode</button>
          </div>
          <div class="nested-actions">
            <button type="button" class="edit-nested" @click="addEpisode(season)">Add episode</button>
            <button type="button" class="edit-nested" @click="seasons.splice(index,1)">Remove season</button>
          </div>
        </section>
        <button type="button" class="edit-nested" data-add-season @click="addSeason">Add season</button>
      </fieldset>
      <label>Public notes (optional)
        <textarea v-model="notes" rows="4" maxlength="5000" placeholder="What should visitors know?"></textarea>
      </label>
    </div>
    <p class="privacy-note">Entries are public. Do not include private information.</p>
    <p v-if="title.trim() && drafted.error" class="error" role="alert">{{ drafted.error }}</p>

    <section v-if="drafted.value" class="preview" aria-label="Generated media entry">
      <h2>Review generated entry</h2>
      <p><strong>Path:</strong> <code>{{ drafted.value.path }}</code></p>
      <div v-if="drafted.value.duplicatePaths.length" class="duplicate" role="alert">
        <p>Possible existing media item. Review before adding a duplicate:</p>
        <ul>
          <li v-for="path in drafted.value.duplicatePaths" :key="path">
            <a :href="editExistingUrl(path)" target="_blank" rel="noopener noreferrer">{{ path }}</a>
          </li>
        </ul>
        <p v-if="hasPathConflict">That file already exists. Edit it instead of adding a new file.</p>
      </div>
      <label>Public record JSON
        <textarea :value="drafted.value.json" rows="12" readonly spellcheck="false" />
      </label>
      <div class="actions">
        <button type="button" @click="copy(drafted.value!.json,'JSON record')">Copy JSON</button>
        <button type="button" @click="copy(drafted.value!.path,'Repository file path')">Copy file path</button>
        <a v-if="githubHref" :href="githubHref" target="_blank" rel="noopener noreferrer">Open GitHub editor</a>
      </div>
      <p class="help">
        {{ drafted.value.duplicatePaths.length
          ? "Check the existing entry before adding another."
          : prefilled
            ? "Check the file in GitHub, then open a pull request."
            : "Copy the file path and JSON into GitHub, then open a pull request." }}
      </p>
    </section>
    <p class="copy-status" role="status" aria-live="polite">{{ outputStatus }}</p>
  </section>
</template>
<style scoped>
.media-editor{max-width:54rem}
.fields{display:grid;gap:1.1rem;margin:1.5rem 0}
.nested-ratings{display:grid;gap:.6rem}
.nested-entry{display:grid;gap:.8rem;padding:.8rem;border:1px solid var(--border)}
.episode-entry{margin-left:1rem}
.nested-actions{display:flex;gap:.5rem;flex-wrap:wrap}
.edit-nested{min-height:2.4rem;padding:.4rem .65rem;background:var(--surface);color:var(--foreground);border:1px solid var(--border);border-radius:0;cursor:pointer;font:inherit;justify-self:start}
.edit-nested:hover,.edit-nested:focus-visible{border-color:var(--accent)}
.nested-ratings input[type=range]{width:100%;accent-color:var(--accent)}
.nested-ratings output{font-weight:400;font-size:.9rem;color:var(--muted)}

label{display:grid;gap:.4rem;font-weight:600}
input:not([type="range"]),textarea{width:100%;min-height:2.75rem;padding:.65rem;font:inherit;color:var(--foreground);
background:var(--surface);border:1px solid var(--border);border-radius:0}
.choice-field{border:0;padding:0;margin:0;min-width:0}
.choice-field legend{font-weight:600;margin-bottom:.4rem;padding:0}
.choice-buttons{display:flex;flex-wrap:wrap;gap:.45rem}
.choice-buttons button,.clear-rating{min-height:2.75rem;padding:.6rem .85rem;font:inherit;cursor:pointer;
border:1px solid var(--border);border-radius:0;color:var(--foreground);background:var(--surface)}
.choice-buttons button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast);font-weight:650}
.choice-buttons button:hover:not([aria-pressed="true"]),.clear-rating:hover{border-color:var(--accent)}
.rating-row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;min-height:2.75rem}
.star-slider{position:relative;display:inline-flex;align-items:center;min-height:2.75rem}
.star-slider:focus-within{outline:3px solid var(--accent);outline-offset:3px}
.stars{display:inline-block;position:relative;font-size:2.15rem;line-height:1.2;letter-spacing:.035em;
white-space:nowrap;user-select:none;pointer-events:none}
.stars-empty{color:var(--muted)}
.stars-filled{position:absolute;left:0;top:0;overflow:hidden;white-space:nowrap;color:var(--rating-star)}
.star-slider input[type="range"]{position:absolute;inset:0;width:100%;height:100%;padding:0;margin:0;
opacity:0;cursor:pointer}
.rating-value{min-width:5.5rem;font-variant-numeric:tabular-nums;font-weight:600}
.clear-rating{min-height:2rem;padding:.3rem .6rem}
.field-hint{margin:.15rem 0 0;color:var(--muted);font-size:.82rem}
textarea{min-height:6rem;resize:vertical;font-weight:400}
.two-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}
.privacy-note,.help,.copy-status{color:var(--muted);font-size:.92rem}
.preview{border-top:1px solid var(--border);margin-top:1.5rem;padding-top:1.25rem}
.preview textarea{font-family:ui-monospace,monospace;min-height:12rem}
.preview code{overflow-wrap:anywhere}
.actions{display:flex;flex-wrap:wrap;gap:.7rem;align-items:center}
.actions a,.actions button{display:inline-flex;align-items:center;min-height:2.75rem;padding:.65rem .95rem;
border:1px solid var(--border);border-radius: 0;background:var(--surface);color:var(--foreground);font:inherit;cursor:pointer;text-decoration:none}
.actions a{color:var(--accent)}
.duplicate,.error{border-left:3px solid var(--accent);padding-left:.8rem}
.duplicate a{overflow-wrap:anywhere}
@media(max-width:35rem){.two-cols{grid-template-columns:1fr}}
</style>
