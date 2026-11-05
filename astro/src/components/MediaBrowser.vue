<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { compareMediaListings, matchesMediaSearch, searchableMediaText, mediaNotesExplainSearch, type MediaSort } from "../lib/media-browser.ts";
import { mediaFilterHref, readMediaQueryState } from "../lib/media-query-state.ts";
import type { MediaKind, StoredMedia } from "../lib/media-model.ts";

const props=defineProps<{kind:MediaKind;entries:StoredMedia[]}>();
const title=computed(()=>props.kind==="music"?"Music":props.kind==="films"?"Films":"TV series");
const creatorLabel=computed(()=>props.kind==="music"?"Artist":props.kind==="films"?"Director":"Creator");
const query=ref("");
const sort=ref<MediaSort>("rating");
const hydrated=ref(false);
const sortOptions:{value:MediaSort;label:string}[]=[
  {value:"rating",label:"Top rated"},
  {value:"title",label:"Title A–Z"},
  {value:"year",label:"Newest"},
];
function syncUrl(): void {
  if (typeof window === "undefined" || !hydrated.value) return;
  const next = mediaFilterHref(window.location.href, query.value, sort.value);
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, "", next);
}

onMounted(() => {
  const initial = readMediaQueryState(window.location.search);
  query.value = initial.query;
  sort.value = initial.sort;
  hydrated.value = true;
  syncUrl();
});
watch([query, sort], syncUrl);
const visible=computed(()=>props.entries
  .filter(item=>matchesMediaSearch(searchableMediaText(item),query.value))
  .sort((a,b)=>compareMediaListings(a,b,sort.value))
);
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
          <input :id="'media-search-'+kind" v-model="query" type="search" data-media-search
                 autocomplete="off" placeholder="Title, creator, notes..." />
        </label>
        <div class="sort-controls" role="group" :aria-label="'Sort '+title.toLowerCase()">
          <button v-for="option in sortOptions" :key="option.value" type="button"
            :data-media-sort="option.value" :aria-pressed="sort===option.value"
            @click="sort=option.value">{{ option.label }}</button>
        </div>
        <p data-media-count role="status" aria-live="polite" aria-atomic="true">
          {{ visible.length }} of {{ entries.length }} entries
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
          <tbody>
            <tr v-for="item in visible" :key="item.id" data-media-row>
              <th scope="row">
                {{ item.title }}
                <details v-if="item.notes" :open="mediaNotesExplainSearch(item, query)">
                  <summary>Notes</summary><p class="notes">{{ item.notes }}</p>
                </details>
              </th>
              <td>{{ item.creator??"—" }}</td>
              <td>{{ item.year??"—" }}</td>
              <td :aria-label="item.rating!==undefined?item.rating+' out of 5 stars':'Not rated'">
                {{ item.rating!==undefined?item.rating.toFixed(1)+' / 5':'—' }}
              </td>
              <td>{{ item.status??"—" }}</td>
              <td>
                <template v-if="item.links?.length">
                  <a v-for="link in item.links" :key="link.url" :href="link.url"
                     target="_blank" rel="noopener noreferrer">{{ link.label }}</a>
                </template>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="hydrated && !visible.length" class="media-no-results" role="status">
        No matching {{ title.toLowerCase() }} entries. Try another search.
      </p>
    </template>
  </section>
</template>
<style scoped>
.media-collection{margin-top:1.25rem;max-width:76rem}
.empty-media{padding:1.5rem;background:var(--surface);border:1px solid var(--border);border-radius: 0}
.media-controls{display:flex;flex-wrap:wrap;align-items:end;gap:.75rem 1.25rem;margin:1rem 0}
.media-controls label{display:grid;gap:.25rem;font-weight:600;min-width:min(100%,18rem)}
.media-controls input{padding:.55rem .7rem;border:1px solid var(--border);border-radius: 0;background:var(--surface);color:var(--foreground);font:inherit;width:100%}
.sort-controls{display:flex;flex-wrap:wrap;gap:.4rem}
.sort-controls button{padding:.5rem .7rem;border:1px solid var(--border);border-radius: 0;background:var(--surface);color:var(--foreground);font:inherit;cursor:pointer}
.sort-controls button[aria-pressed="true"]{border-color:var(--accent);color:var(--accent);font-weight:700}
[data-media-count]{color:var(--muted);margin:.3rem 0}
.media-no-results{color:var(--muted)}
.media-scroll{overflow-x:auto;margin:1rem 0 2rem}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
caption{text-align:start;color:var(--muted);padding:.6rem 0}
th,td{padding:.8rem .65rem;text-align:start;vertical-align:top;border-bottom:1px solid var(--border)}
tbody th{max-width:25rem;overflow-wrap:anywhere}
td{overflow-wrap:anywhere}
td:last-child a{display:block;min-width:4rem;margin-bottom:.35rem}
details{margin-top:.5rem;font-size:.88rem;font-weight:400}
details summary{cursor:pointer;color:var(--accent)}
.notes{max-width:55ch;white-space:pre-wrap}
@media(max-width:700px){th,td{padding:.65rem .45rem;font-size:.88rem}}
</style>
