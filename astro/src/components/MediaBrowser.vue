<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { compareMediaListings, matchesMediaSearch, matchesMediaStatus, matchesMediaMinimumRating, searchableMediaText, mediaNotesExplainSearch, mediaVisiblePage, MEDIA_PAGE_SIZE, type MediaSort, type MediaStatusFilter } from "../lib/media-browser.ts";
import { mediaFilterHref, readMediaQueryState } from "../lib/media-query-state.ts";
import type { MediaKind, StoredMedia } from "../lib/media-model.ts";

const props=defineProps<{kind:MediaKind;entries:StoredMedia[]}>();
const title=computed(()=>props.kind==="music"?"Music":props.kind==="films"?"Films":"TV series");
const creatorLabel=computed(()=>props.kind==="music"?"Artist":props.kind==="films"?"Director":"Creator");
const query=ref("");
const sort=ref<MediaSort>("rating");
const statusFilter=ref<MediaStatusFilter>("all");
const minRating=ref(0);
const minRatingLabel=computed(()=>minRating.value === 0 ? "Any rating (includes unrated)" : minRating.value.toFixed(1) + " stars or more");
const limit=ref(MEDIA_PAGE_SIZE);
const hydrated=ref(false);
const searchInput=ref<HTMLInputElement|null>(null);
const tableBody=ref<HTMLTableSectionElement|null>(null);
async function clearFilters():Promise<void> {
  query.value="";
  sort.value="rating";
  statusFilter.value="all";
  minRating.value=0;
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
  const next = mediaFilterHref(window.location.href, query.value, sort.value, statusFilter.value, minRating.value);
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, "", next);
}

const restoreFilters = (): void => {
  const state = readMediaQueryState(window.location.search);
  query.value = state.query;
  sort.value = state.sort;
  statusFilter.value = state.status;
  minRating.value = state.minRating;
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
watch([query, sort, statusFilter, minRating], () => {
  limit.value = MEDIA_PAGE_SIZE;
  syncUrl();
});
const matches=computed(()=>props.entries
  .filter(item=>matchesMediaSearch(searchableMediaText(item),query.value) && matchesMediaStatus(item,statusFilter.value) && matchesMediaMinimumRating(item,minRating.value))
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
        <button v-if="hydrated && (query || sort !== 'rating' || statusFilter !== 'all' || minRating > 0)" class="clear-media"
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
              <td>{{ item.status==="in-progress" ? "In progress" : item.status==="finished" ? "Finished" : item.status==="planned" ? "Planned" : "—" }}</td>
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
td:last-child a{display:block;min-width:4rem;margin-bottom:.35rem}
details{margin-top:.5rem;font-size:.88rem;font-weight:400}
details summary{cursor:pointer;color:var(--accent)}
.notes{max-width:55ch;white-space:pre-wrap}
@media(max-width:700px){th,td{padding:.65rem .45rem;font-size:.88rem}}
</style>
