<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { composeMediaDraft, githubMediaEditorUrl, type ExistingMediaRef, type MediaKind, type MediaRecord } from "../lib/media-model.ts";

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
const primaryUrl=ref("");
const secondaryUrl=ref("");
const outputStatus=ref("");
const editorLimit=3900;

const drafted=computed(()=>{
  try {
    const input:MediaRecord={schema:1,kind:kind.value,title:title.value.trim()};
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
    if(primaryUrl.value.trim()) links.push({label:"Primary reference",url:primaryUrl.value.trim()});
    if(secondaryUrl.value.trim()) links.push({label:"Additional reference",url:secondaryUrl.value.trim()});
    if(links.length) input.links=links;
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
      <label>Artist, director, or creator (optional)
        <input v-model="creator" type="text" maxlength="220" placeholder="Who made it?" />
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
