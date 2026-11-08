<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { compareMediaListings, matchesMediaSearch, matchesMediaStatus, matchesMediaMinimumRating, searchableMediaText, mediaNotesExplainSearch, mediaVisiblePage, MEDIA_PAGE_SIZE, type MediaSort, type MediaStatusFilter } from "../lib/media-browser.ts";
import { mediaFilterHref, readMediaQueryState } from "../lib/media-query-state.ts";
import { mediaSourceLinks, composeMediaReferenceEdit, githubExistingMediaEditorUrl, MEDIA_REFERENCE_PLATFORMS, type MediaKind, type StoredMedia, type MediaPlatform, type MediaProviderCatalogRef } from "../lib/media-model.ts";

const props=defineProps<{kind:MediaKind;entries:StoredMedia[];otherProviderRefs:MediaProviderCatalogRef[]}>();
const title=computed(()=>props.kind==="music"?"Music":props.kind==="films"?"Films":"TV series");
const creatorLabel=computed(()=>props.kind==="music"?"Artist":props.kind==="films"?"Director":"Creator");
const query=ref("");
const sort=ref<MediaSort>("rating");
const statusFilter=ref<MediaStatusFilter>("all");
const minRating=ref(0);
const minRatingLabel=computed(()=>minRating.value === 0 ? "Any rating (includes unrated)" : minRating.value.toFixed(1) + " stars or more");
const limit=ref(MEDIA_PAGE_SIZE);
const missingRefsOnly=ref(false);
// The owner must commit changes through GitHub. No public write API is exposed.
const editing=ref<StoredMedia|null>(null);
const providerDialog=ref<HTMLDialogElement|null>(null);
const providerInputs=ref<Record<MediaPlatform,string>>({
  imdb:"",tmdb:"",wikipedia:"",letterboxd:"",musicbrainz:"",
});
const copyStatus=ref("");
const providerFields:{platform:MediaPlatform;label:string;hint:string}[]=[
  {platform:"musicbrainz",label:"MusicBrainz",hint:"Release-group UUID or direct link"},
  {platform:"imdb",label:"IMDb",hint:"tt1234567 or direct title link"},
  {platform:"tmdb",label:"TMDb",hint:"movie:123 or tv:456, or direct link"},
  {platform:"wikipedia",label:"Wikipedia",hint:"en:Article_Title or direct article link"},
  {platform:"letterboxd",label:"Letterboxd",hint:"Short boxd.it ID or direct link"},
];
function editProviderIds(item:StoredMedia):void {
  editing.value=item;
  providerInputs.value={
    imdb:item.refs?.imdb??"",
    tmdb:item.refs?.tmdb??"",
    wikipedia:item.refs?.wikipedia??"",
    letterboxd:item.refs?.letterboxd??"",
    musicbrainz:item.refs?.musicbrainz??"",
  };
  copyStatus.value="";
  void nextTick(()=>providerDialog.value?.showModal());
}
const updatedReferences=computed(()=>{
  if(!editing.value)return {value:null,error:""};
  try {
    return {value:composeMediaReferenceEdit(editing.value,providerInputs.value,[...props.entries,...props.otherProviderRefs]),error:""};
  } catch(error){
    return {value:null,error:error instanceof Error?error.message:"Invalid provider ID"};
  }
});
async function copyProviderJson():Promise<void> {
  const result=updatedReferences.value.value;
  if(!result?.changed)return;
  try {
    await navigator.clipboard.writeText(result.json);
    copyStatus.value="Replacement JSON copied. Paste it over the existing GitHub file.";
  } catch {
    copyStatus.value="Clipboard unavailable. Select the replacement JSON below to copy manually.";
  }
}
function closeProviderDialog():void { providerDialog.value?.close(); }

const hydrated=ref(false);
const searchInput=ref<HTMLInputElement|null>(null);
const tableBody=ref<HTMLTableSectionElement|null>(null);
async function clearFilters():Promise<void> {
  query.value="";
  sort.value="rating";
  statusFilter.value="all";
  minRating.value=0;
  missingRefsOnly.value=false;
  // The reset button disappears once filters are cleared. Move keyboard
  // focus to the persistent search control after Vue has rendered.
  await nextTick();
  searchInput.value?.focus();
}
const statusOptions:{value:MediaStatusFilter;label:string}[]=[
  {value:"all",label:"All statuses"},
  {value:"finished",label:"Finished"},
  {value:"in-progress",label:"In progress"},
  {value:"planned",label:"Planned"},
  {value:"unspecified",label:"Not specified"},
];
const sortOptions:{value:MediaSort;label:string}[]=[
  {value:"rating",label:"Top rated"},
  {value:"title",label:"Title A–Z"},
  {value:"year",label:"Newest"},
];
function syncUrl(): void {
  if (typeof window === "undefined" || !hydrated.value) return;
  const next = mediaFilterHref(window.location.href, query.value, sort.value, statusFilter.value, minRating.value, missingRefsOnly.value);
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, "", next);
}

const restoreFilters = (): void => {
  const state = readMediaQueryState(window.location.search);
  query.value = state.query;
  sort.value = state.sort;
  statusFilter.value = state.status;
  minRating.value = state.minRating;
  missingRefsOnly.value = state.missingRefsOnly;
  hydrated.value = true;
  // A restored history entry may carry obsolete or repeated filter values.
  syncUrl();
};
onMounted(() => {
  restoreFilters();
  window.addEventListener("popstate", restoreFilters);
  // BFCache navigations do not remount a Vue island; restore the address then.
  window.addEventListener("pageshow", restoreFilters);
});
onUnmounted(() => {
  window.removeEventListener("popstate", restoreFilters);
  window.removeEventListener("pageshow", restoreFilters);
});
watch([query, sort, statusFilter, minRating, missingRefsOnly], () => {
  limit.value = MEDIA_PAGE_SIZE;
  syncUrl();
});
const matches=computed(()=>props.entries
  .filter(item=>matchesMediaSearch(searchableMediaText(item),query.value) && matchesMediaStatus(item,statusFilter.value) && matchesMediaMinimumRating(item,minRating.value) &&
    (!missingRefsOnly.value || !MEDIA_REFERENCE_PLATFORMS.some(platform=>Boolean(item.refs?.[platform]))))
  .sort((a,b)=>compareMediaListings(a,b,sort.value))
);
// Server-render the complete source-owned catalog for non-JS visitors and
// parity audits, but only keep one page of live rows after Vue hydration.
const visible=computed(()=>mediaVisiblePage(matches.value,limit.value,hydrated.value));
async function showMore(): Promise<void> {
  const previous = visible.value.length;
  limit.value += MEDIA_PAGE_SIZE;
  await nextTick();
  // The button disappears on the last page; focus the first new row so
  // keyboard and screen-reader users keep their position in the results.
  const row = tableBody.value?.querySelectorAll<HTMLTableRowElement>("tr[data-media-row]")[previous];
  const heading = row?.querySelector<HTMLElement>("th[scope=row]");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
  }
}
</script>
<template>
  <section class="media-collection" data-media-collection :aria-label="title+' collection'">
    <p v-if="!entries.length" class="empty-media" role="status">
      No {{ title.toLowerCase() }} yet.
    </p>
    <template v-else>
      <div v-show="hydrated" class="media-controls" data-media-controls>
        <label :for="'media-search-'+kind">
          Search {{ title.toLowerCase() }}
          <input ref="searchInput" :id="'media-search-'+kind" v-model="query" type="search" data-media-search
                 autocomplete="off" placeholder="Title, creator, notes..." />
        </label>
        <div class="sort-controls" role="group" :aria-label="'Sort '+title.toLowerCase()">
          <button v-for="option in sortOptions" :key="option.value" type="button"
            :data-media-sort="option.value" :aria-pressed="sort===option.value"
            @click="sort=option.value">{{ option.label }}</button>
        </div>
        <div class="status-controls" role="group" aria-label="Filter by status">
          <button v-for="option in statusOptions" :key="option.value" type="button"
            :data-media-status-filter="option.value" :aria-pressed="statusFilter===option.value"
            @click="statusFilter=option.value">{{ option.label }}</button>
        </div>
        <label class="rating-control">
          Minimum rating
          <input v-model.number="minRating" data-media-min-rating type="range" min="0" max="5" step="0.5"
            :aria-valuetext="minRatingLabel" />
          <output data-media-min-rating-label aria-live="polite">{{ minRatingLabel }}</output>
        </label>
        <button type="button" class="missing-ref-filter" data-media-missing-ids
          :aria-pressed="missingRefsOnly" @click="missingRefsOnly=!missingRefsOnly">Missing provider IDs only</button>
        <button v-if="hydrated && (query || sort !== 'rating' || statusFilter !== 'all' || minRating > 0 || missingRefsOnly)" class="clear-media"
          type="button" data-media-clear-filters
          @click="clearFilters">Clear filters</button>
        <p data-media-count role="status" aria-live="polite" aria-atomic="true">
          {{ matches.length }} of {{ entries.length }} entries
        </p>
      </div>
      <div class="media-scroll">
        <table>
          <caption>{{ entries.length }} {{ title.toLowerCase() }} entries</caption>
          <thead>
            <tr><th scope="col">Title</th><th scope="col">{{ creatorLabel }}</th>
              <th scope="col">Year</th><th scope="col">My rating</th>
              <th scope="col">Status</th><th scope="col">Links</th></tr>
          </thead>
          <tbody ref="tableBody">
            <tr v-for="item in visible" :key="item.id" data-media-row>
              <th scope="row">
                {{ item.title }}{{ item.edition ? " · " + item.edition : "" }}
                <details v-if="item.notes" :open="mediaNotesExplainSearch(item, query)">
                  <summary>Notes</summary><p class="notes">{{ item.notes }}</p>
                </details>
                <details v-if="kind==='music' && item.tracks?.length" class="media-subratings">
                  <summary>Album tracks ({{ item.tracks.length }})</summary>
                  <ol class="subratings">
                    <li v-for="track in item.tracks" :key="track.disc+':'+track.number"
                        :data-media-track="JSON.stringify(track)">
                      <span>{{ track.disc }}.{{ track.number }} — {{ track.title }}</span>
                      <span :aria-label="track.rating===undefined?'Track not rated':track.rating+' out of 5 stars'">
                        {{ track.rating===undefined?'Not rated':track.rating.toFixed(1)+' / 5' }}
                      </span>
                    </li>
                  </ol>
                </details>
                <details v-if="kind==='tv' && item.seasons?.length" class="media-subratings">
                  <summary>Seasons and episodes ({{ item.seasons.length }})</summary>
                  <section v-for="season in item.seasons" :key="season.number"
                           class="media-season"
                           :data-media-season="JSON.stringify({number:season.number,...(season.title?{title:season.title}:{}),...(season.rating!==undefined?{rating:season.rating}:{})})">
                    <h4>
                      {{ season.number===0?'Specials':'Season '+season.number }}{{ season.title?' — '+season.title:'' }}
                      <span :aria-label="season.rating===undefined?'Season not rated':season.rating+' out of 5 stars'">
                        {{ season.rating===undefined?'Not rated':season.rating.toFixed(1)+' / 5' }}
                      </span>
                    </h4>
                    <ol v-if="season.episodes?.length" class="subratings">
                      <li v-for="episode in season.episodes" :key="episode.number"
                          :data-media-episode="JSON.stringify({season:season.number,...episode})">
                        <span>Episode {{ episode.number }}{{ episode.title?' — '+episode.title:'' }}</span>
                        <span :aria-label="episode.rating===undefined?'Episode not rated':episode.rating+' out of 5 stars'">
                          {{ episode.rating===undefined?'Not rated':episode.rating.toFixed(1)+' / 5' }}
                        </span>
                      </li>
                    </ol>
                  </section>
                </details>
              </th>
              <td>{{ item.creator??"—" }}</td>
              <td>{{ item.year??"—" }}</td>
              <td :aria-label="item.rating!==undefined?item.rating+' out of 5 stars':'Not rated'">
                {{ item.rating!==undefined?item.rating.toFixed(1)+' / 5':'—' }}
              </td>
              <td>{{ item.status==="in-progress" ? "In progress" : item.status==="finished" ? "Finished" : item.status==="planned" ? "Planned" : "—" }}</td>
              <td class="media-link-cell">
                <div v-if="mediaSourceLinks(item).length" class="media-reference-buttons" role="group"
                     :aria-label="'External references for '+item.title">
                  <a v-for="link in mediaSourceLinks(item)" :key="link.url" :href="link.url"
                     class="media-reference-button" :data-media-provider="link.label"
                     :aria-label="link.label+' (opens in a new tab)'"
                     target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
                </div>
                <template v-else>—</template>
                <button type="button" class="media-edit-ids" data-media-ref-edit
                  :aria-label="(MEDIA_REFERENCE_PLATFORMS.some(platform=>Boolean(item.refs?.[platform]))?'Edit':'Add')+' provider IDs for '+item.title"
                  @click="editProviderIds(item)">
                  {{ MEDIA_REFERENCE_PLATFORMS.some(platform=>Boolean(item.refs?.[platform]))?'Edit IDs':'Add ID' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="hydrated && matches.length > MEDIA_PAGE_SIZE" class="media-page-count" data-media-visible-count
         role="status" aria-live="polite">Showing {{ visible.length }} of {{ matches.length }} matching entries</p>
      <button v-if="hydrated && visible.length < matches.length" type="button"
        class="media-more" data-media-load-more @click="showMore">
        Show more
      </button>
      <p v-if="hydrated && !matches.length" class="media-no-results" role="status">
        No matching {{ title.toLowerCase() }} entries. Try another search.
      </p>
    </template>
  </section>
  <dialog v-if="editing" ref="providerDialog" class="media-provider-dialog"
          aria-label="Edit media provider IDs" @close="editing=null">
    <div class="provider-editor">
      <h2>Provider IDs: {{ editing.title }}</h2>
      <p class="provider-help">
        {{ editing.creator??'Unknown creator' }}{{ editing.year?' · '+editing.year:'' }}.
        Paste an ID or canonical direct URL. Clear a field to remove its provider ID.
        All other record details, including ratings, will be preserved.
      </p>
      <div class="provider-field-grid">
        <label v-for="field in providerFields" :key="field.platform">
          <strong>{{ field.label }}</strong>
          <span class="provider-hint">{{ field.hint }}</span>
          <input v-model="providerInputs[field.platform]" type="text" spellcheck="false"
                 autocomplete="off" :data-provider-field="field.platform"
                 :aria-label="field.label+' provider ID'"/>
        </label>
      </div>
      <p v-if="updatedReferences.error" role="alert" class="provider-error">{{ updatedReferences.error }}</p>
      <section v-if="updatedReferences.value?.changed" class="provider-result" aria-label="Updated media JSON">
        <p>Copy the JSON, open the existing GitHub file, replace its contents and commit the change.
          This site does not directly change repository files.</p>
        <p><code>{{ updatedReferences.value?.path }}</code></p>
        <div class="provider-actions">
          <button type="button" data-copy-media-refs @click="copyProviderJson">Copy updated JSON</button>
          <a :href="githubExistingMediaEditorUrl(editing.path)" target="_blank"
             rel="noopener noreferrer">Open GitHub editor</a>
        </div>
        <textarea readonly :value="updatedReferences.value?.json??''" rows="7"
                  aria-label="Replacement JSON for the selected media record"></textarea>
      </section>
      <p v-else-if="!updatedReferences.error" class="provider-help">No provider ID changes yet.</p>
      <p v-if="copyStatus" class="provider-help" role="status">{{ copyStatus }}</p>
      <div class="provider-actions">
        <button type="button" @click="closeProviderDialog">Close</button>
      </div>
    </div>
  </dialog>
</template>
<style scoped>
.media-collection{margin-top:1.25rem;max-width:76rem}
.empty-media{padding:1.5rem;background:var(--surface);border:1px solid var(--border);border-radius: 0}
.media-controls{display:flex;flex-wrap:wrap;align-items:end;gap:.75rem 1.25rem;margin:1rem 0}
.media-controls label{display:grid;gap:.25rem;font-weight:600;min-width:min(100%,18rem)}
.media-controls input{padding:.55rem .7rem;border:1px solid var(--border);border-radius: 0;background:var(--surface);color:var(--foreground);font:inherit;width:100%}
.media-controls .rating-control{min-width:min(100%,15rem);display:grid;gap:.3rem;font-weight:600}
.media-controls .rating-control input{padding:0;accent-color:var(--accent)}
.rating-control output{font-size:.85rem;font-weight:400;color:var(--muted)}
.sort-controls,.status-controls{display:flex;flex-wrap:wrap;gap:.4rem}
.sort-controls button,.status-controls button{padding:.5rem .7rem;border:1px solid var(--border);border-radius: 0;background:var(--surface);color:var(--foreground);font:inherit;cursor:pointer}
.sort-controls button[aria-pressed="true"],.status-controls button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);font-weight:700}
.clear-media{padding:.5rem .7rem;min-height:2.75rem;border:1px solid var(--border);border-radius:0;background:var(--surface);color:var(--foreground);font:inherit;cursor:pointer}
.clear-media:hover,.clear-media:focus-visible{border-color:var(--accent)}
.missing-ref-filter{padding:.5rem .7rem;min-height:2.75rem;border:1px solid var(--border);border-radius:0;
 background:var(--surface);color:var(--foreground);font:inherit;cursor:pointer}
.missing-ref-filter[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);font-weight:700}
[data-media-count]{color:var(--muted);margin:.3rem 0}
.media-no-results{color:var(--muted)}
.media-page-count{color:var(--muted);margin:0 0 .65rem}
.media-more{padding:.6rem 1rem;margin:0 0 1.2rem;border:1px solid var(--border);border-radius:0;background:var(--surface);color:var(--foreground);font:inherit;cursor:pointer}
.media-more:hover,.media-more:focus-visible{border-color:var(--accent)}
tbody th:focus{outline:2px solid var(--accent);outline-offset:2px}
.media-scroll{overflow-x:auto;margin:1rem 0 2rem}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
caption{text-align:start;color:var(--muted);padding:.6rem 0}
th,td{padding:.8rem .65rem;text-align:start;vertical-align:top;border-bottom:1px solid var(--border)}
tbody th{max-width:25rem;overflow-wrap:anywhere}
td{overflow-wrap:anywhere}
.media-reference-buttons{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}
.media-reference-button{display:inline-flex;align-items:center;gap:.35rem;justify-content:center;
 min-height:2.35rem;padding:.35rem .65rem;border:1px solid var(--border);border-radius:0;
 background:var(--surface);color:var(--foreground);font-size:.78rem;font-weight:600;
 line-height:1.2;white-space:nowrap;text-decoration:none;transition:border-color .12s ease,background-color .12s ease}
.media-reference-button::after{content:"↗";font-size:.8em;color:var(--muted)}
.media-reference-button:hover{border-color:var(--accent);color:var(--accent);background:var(--surface)}
.media-reference-button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.media-reference-button{transition:none}}
details{margin-top:.5rem;font-size:.88rem;font-weight:400}
details summary{cursor:pointer;color:var(--accent)}
.notes{max-width:55ch;white-space:pre-wrap}
.media-subratings{margin-top:.55rem}
.media-subratings summary{font-weight:600}
.subratings{margin:.45rem 0;padding-left:1.3rem;list-style:decimal}
.subratings li{display:flex;justify-content:space-between;gap:.7rem;border-bottom:1px solid var(--border);padding:.3rem 0}
.subratings li span:last-child,.media-season h4 span{font-size:.82rem;white-space:nowrap;color:var(--muted);font-variant-numeric:tabular-nums}
.media-season{margin:.65rem 0}
.media-season h4{display:flex;justify-content:space-between;gap:.7rem;margin:.3rem 0;font-size:.93rem}

@media(max-width:700px){th,td{padding:.65rem .45rem;font-size:.88rem}}
.media-edit-ids{display:block;margin-top:.35rem;padding:.3rem .5rem;border:1px solid var(--border);
 background:var(--surface);color:var(--accent);font:inherit;font-size:.78rem;cursor:pointer;border-radius:0}
.media-edit-ids:hover,.media-edit-ids:focus-visible{border-color:var(--accent)}
.media-provider-dialog{width:min(94vw,45rem);max-height:90vh;overflow:auto;padding:1.3rem;
 background:var(--surface);color:var(--foreground);border:1px solid var(--border);border-radius:0}
.media-provider-dialog::backdrop{background:rgba(0,0,0,.64)}
.provider-editor h2{margin:0 0 .5rem}
.provider-help{color:var(--muted);font-size:.92rem}
.provider-field-grid{display:grid;gap:.75rem;margin:1rem 0}
.provider-field-grid label{display:grid;gap:.22rem}
.provider-hint{color:var(--muted);font-size:.82rem}
.provider-field-grid input,.provider-result textarea{width:100%;min-height:2.6rem;padding:.55rem .65rem;
 background:var(--surface);color:var(--foreground);border:1px solid var(--border);border-radius:0;font:inherit}
.provider-result{border-top:1px solid var(--border);margin-top:1rem}
.provider-result code{overflow-wrap:anywhere}
.provider-result textarea{font-family:ui-monospace,monospace;min-height:10rem;resize:vertical}
.provider-error{border-left:3px solid var(--accent);padding-left:.7rem}
.provider-actions{display:flex;flex-wrap:wrap;gap:.65rem;margin:.8rem 0}
.provider-actions a,.provider-actions button{padding:.55rem .75rem;min-height:2.5rem;
 border:1px solid var(--border);background:var(--surface);color:var(--accent);border-radius:0;
 text-decoration:none;font:inherit;cursor:pointer}
.provider-actions a:hover,.provider-actions button:hover{border-color:var(--accent)}

</style>
