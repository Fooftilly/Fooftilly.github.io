<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { composeMediaRatingsEdit, githubExistingMediaEditorUrl, type StoredMedia } from "../lib/media-model.ts";
import { nextAvailableMediaPosition } from "../lib/media-editor-positions.ts";

// The site only prepares replacement JSON. Saving still requires a GitHub
// commit and normal repository permissions; do not add a public write API.
const props=defineProps<{entry:StoredMedia}>();
const emit=defineEmits<{(e:"close"):void}>();
type Position=string|number;
type TrackInput={disc:Position;number:Position;title:string;rating:number};
type EpisodeInput={number:Position;title:string;rating:number};
type SeasonInput={number:Position;title:string;rating:number;episodes:EpisodeInput[]};
const dialog=ref<HTMLDialogElement|null>(null);
const rating=ref(props.entry.rating??0);
const tracks=ref<TrackInput[]>((props.entry.tracks??[]).map(t=>({...t,rating:t.rating??0})));
const seasons=ref<SeasonInput[]>((props.entry.seasons??[]).map(s=>({
  number:s.number,title:s.title??"",rating:s.rating??0,
  episodes:(s.episodes??[]).map(e=>({number:e.number,title:e.title??"",rating:e.rating??0})),
})));
const feedback=ref("");
const editError=ref("");
onMounted(()=>{void nextTick(()=>dialog.value?.showModal());});
const scoreLabel=(score:number):string=>score===0?"Not rated":score.toFixed(1)+" / 5";
function addTrack():void {
  try {
    const disc=1;
    const number=nextAvailableMediaPosition(
      tracks.value.filter(t=>Number(t.disc)===disc).map(t=>t.number),250);
    tracks.value.push({disc,number,title:"",rating:0});
    editError.value="";
  }catch(error){editError.value=error instanceof Error?error.message:"Cannot add track";}
}
function addSeason():void {
  try {
    seasons.value.push({
      number:nextAvailableMediaPosition(seasons.value.map(s=>s.number),200),
      title:"",rating:0,episodes:[],
    });
    editError.value="";
  }catch(error){editError.value=error instanceof Error?error.message:"Cannot add season";}
}
function addEpisode(season:SeasonInput):void {
  try {
    season.episodes.push({
      number:nextAvailableMediaPosition(season.episodes.map(e=>e.number),1000),
      title:"",rating:0,
    });
    editError.value="";
  }catch(error){editError.value=error instanceof Error?error.message:"Cannot add episode";}
}
const updated=computed(()=>{
  try {
    const input={
      rating:rating.value,
      ...(props.entry.kind==="music"?{tracks:tracks.value.map(t=>({
        disc:Number(t.disc),number:Number(t.number),title:t.title,
        ...(t.rating>0?{rating:t.rating}:{}),
      }))}:{}),
      ...(props.entry.kind==="tv"?{seasons:seasons.value.map(s=>({
        number:Number(s.number),
        ...(s.title.trim()?{title:s.title.trim()}:{}),
        ...(s.rating>0?{rating:s.rating}:{}),
        ...(s.episodes.length?{episodes:s.episodes.map(e=>({
          number:Number(e.number),
          ...(e.title.trim()?{title:e.title.trim()}:{}),
          ...(e.rating>0?{rating:e.rating}:{}),
        }))}:{})
      }))}:{}),
    };
    return {value:composeMediaRatingsEdit(props.entry,input),error:""};
  }catch(error){return {value:null,error:error instanceof Error?error.message:"Invalid ratings edit"};}
});
async function copyJson():Promise<void> {
  if(!updated.value.value?.changed)return;
  try {
    await navigator.clipboard.writeText(updated.value.value.json);
    feedback.value="Replacement JSON copied. Paste it into the existing GitHub file.";
  }catch{feedback.value="Clipboard unavailable. Select and copy the JSON manually.";}
}
function close():void{dialog.value?.close();}
</script>

<template>
  <dialog ref="dialog" class="media-ratings-dialog" :aria-label="'Edit ratings for '+entry.title"
          @close="emit('close')">
    <div class="ratings-editor">
      <h2>Edit ratings: {{ entry.title }}{{ entry.edition?' · '+entry.edition:'' }}</h2>
      <p class="help">Edit only the ratings or manually identified tracks, seasons and episodes.
        Unrelated metadata and source identity are preserved. Nothing is saved until you commit on GitHub.</p>
      <label class="rating-field">
        Overall rating
        <input v-model.number="rating" data-edit-overall-rating type="range"
               min="0" max="5" step="0.5"
               :aria-valuetext="rating===0?'Not rated':rating+' out of 5 stars'" />
        <output data-edit-overall-label>{{ scoreLabel(rating) }}</output>
      </label>
      <fieldset v-if="entry.kind==='music'" data-edit-album-tracks>
        <legend>Album tracks (optional)</legend>
        <p class="help">Only enter track titles, positions and scores you know. A track rating does not change the album rating.</p>
        <section v-for="(track,index) in tracks" :key="index" class="nested-entry" data-edit-track>
          <div class="two-cols">
            <label>Disc
              <input v-model="track.disc" type="number" inputmode="numeric" min="1" max="50" step="1" />
            </label>
            <label>Track
              <input v-model="track.number" type="number" inputmode="numeric" min="1" max="250" step="1" />
            </label>
          </div>
          <label>Track title
            <input v-model="track.title" data-edit-track-title type="text" maxlength="250" />
          </label>
          <label>Track rating
            <input v-model.number="track.rating" data-edit-track-rating type="range"
                   min="0" max="5" step="0.5"
                   :aria-valuetext="track.rating===0?'Not rated':track.rating+' out of 5 stars'" />
            <output>{{ scoreLabel(track.rating) }}</output>
          </label>
          <button type="button" @click="tracks.splice(index,1)">Remove track</button>
        </section>
        <button type="button" data-edit-add-track @click="addTrack">Add track</button>
      </fieldset>
      <fieldset v-if="entry.kind==='tv'" data-edit-tv-seasons>
        <legend>Seasons and episodes (optional)</legend>
        <p class="help">Scores remain independent. Season 0 is for specials; episode numbering restarts each season.</p>
        <section v-for="(season,index) in seasons" :key="index" class="nested-entry" data-edit-season>
          <div class="two-cols">
            <label>Season number
              <input v-model="season.number" type="number" min="0" max="200" step="1" />
            </label>
            <label>Season title (optional)
              <input v-model="season.title" type="text" maxlength="250" />
            </label>
          </div>
          <label>Season rating
            <input v-model.number="season.rating" data-edit-season-rating type="range"
                   min="0" max="5" step="0.5"
                   :aria-valuetext="season.rating===0?'Not rated':season.rating+' out of 5 stars'" />
            <output>{{ scoreLabel(season.rating) }}</output>
          </label>
          <div v-for="(episode,episodeIndex) in season.episodes" :key="episodeIndex"
               class="nested-entry episode" data-edit-episode>
            <div class="two-cols">
              <label>Episode number
                <input v-model="episode.number" type="number" min="1" max="1000" step="1" />
              </label>
              <label>Episode title (optional)
                <input v-model="episode.title" type="text" maxlength="250" />
              </label>
            </div>
            <label>Episode rating
              <input v-model.number="episode.rating" data-edit-episode-rating type="range"
                     min="0" max="5" step="0.5"
                     :aria-valuetext="episode.rating===0?'Not rated':episode.rating+' out of 5 stars'" />
              <output>{{ scoreLabel(episode.rating) }}</output>
            </label>
            <button type="button" @click="season.episodes.splice(episodeIndex,1)">Remove episode</button>
          </div>
          <div class="actions">
            <button type="button" @click="addEpisode(season)">Add episode</button>
            <button type="button" @click="seasons.splice(index,1)">Remove season</button>
          </div>
        </section>
        <button type="button" data-edit-add-season @click="addSeason">Add season</button>
      </fieldset>
      <p v-if="editError || updated.error" role="alert" class="error">{{ editError || updated.error }}</p>
      <section v-if="updated.value?.changed" class="result" aria-label="Updated media ratings JSON">
        <p>Copy this JSON, replace the contents of the existing GitHub file, and commit the change.</p>
        <p><code>{{ updated.value.path }}</code></p>
        <div class="actions">
          <button type="button" data-copy-media-ratings @click="copyJson">Copy updated JSON</button>
          <a :href="githubExistingMediaEditorUrl(entry.path)" target="_blank"
             rel="noopener noreferrer">Open existing GitHub file</a>
        </div>
        <textarea :value="updated.value.json" rows="8" readonly spellcheck="false"
                  aria-label="Replacement ratings JSON"></textarea>
      </section>
      <p v-else-if="!updated.error" class="help">No rating changes yet.</p>
      <p v-if="feedback" role="status" class="help">{{ feedback }}</p>
      <div class="actions"><button type="button" data-close-media-ratings @click="close">Close</button></div>
    </div>
  </dialog>
</template>

<style scoped>
.media-ratings-dialog{width:min(96vw,48rem);max-height:90vh;overflow-y:auto;
 border:1px solid var(--border);border-radius:0;background:var(--surface);color:var(--foreground);padding:1.3rem}
.media-ratings-dialog::backdrop{background:rgba(0,0,0,.6)}
.ratings-editor{display:grid;gap:1rem}
h2{margin:0}
.help{color:var(--muted);margin:.25rem 0;font-size:.9rem}
.rating-field,label{display:grid;gap:.35rem}
.rating-field{font-weight:600}
input[type=number],input[type=text]{width:100%;min-width:0;padding:.5rem;border:1px solid var(--border);
 border-radius:0;background:var(--surface);color:var(--foreground);font:inherit}
input[type=range]{width:100%;accent-color:var(--accent)}
output{color:var(--muted);font-size:.85rem}
fieldset{min-width:0;border:1px solid var(--border);display:grid;gap:.8rem;padding:.8rem}
legend{font-weight:700}
.nested-entry{display:grid;gap:.7rem;border:1px solid var(--border);padding:.75rem;min-width:0}
.episode{margin-left:.6rem}
.two-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.6rem}
.actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
button,.actions a{display:inline-flex;align-items:center;justify-content:center;
 min-height:2.5rem;padding:.45rem .7rem;background:var(--surface);color:var(--foreground);
 border:1px solid var(--border);border-radius:0;font:inherit;cursor:pointer;text-decoration:none}
button:hover,button:focus-visible,.actions a:hover,.actions a:focus-visible{border-color:var(--accent);color:var(--accent)}
.error{color:var(--accent);overflow-wrap:anywhere}
.result{display:grid;gap:.45rem;border-top:1px solid var(--border);padding-top:.75rem}
.result code{overflow-wrap:anywhere}
textarea{width:100%;min-height:7rem;background:var(--surface);color:var(--foreground);
 border:1px solid var(--border);border-radius:0;font:inherit;font-size:.84rem}
@media(max-width:520px){.two-cols{grid-template-columns:1fr}.media-ratings-dialog{padding:.75rem}}
</style>
