<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
const rating=ref<string|number>("");
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
    const ratingText=String(rating.value ?? "").trim();
    if(ratingText) input.rating=Number(ratingText);
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
      <label>Media type
        <select v-model="kind">
          <option value="films">Film</option>
          <option value="tv">TV series</option>
          <option value="music">Music</option>
        </select>
      </label>
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
        <label>My rating (optional)
          <input v-model="rating" type="number" inputmode="decimal" min="0.5" max="5" step="0.5" placeholder="0.5–5 stars" />
        </label>
      </div>
      <label>Status (optional)
        <select v-model="status">
          <option value="">Not specified</option>
          <option value="finished">Finished</option>
          <option value="in-progress">In progress</option>
          <option value="planned">Planned</option>
        </select>
      </label>
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
input,select,textarea{width:100%;min-height:2.75rem;padding:.65rem;font:inherit;color:var(--foreground);
background:var(--surface);border:1px solid var(--border);border-radius: 0}
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
