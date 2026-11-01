<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { filterAndSortBookmarks, type Bookmark, type BookmarkSort } from "../lib/bookmark-filter.ts";
import { bookmarkCategoryDisplayLabel } from "../lib/bookmark-categories.ts";

const props = withDefaults(defineProps<{ items: Bookmark[]; lang?: "en" | "sr" }>(), {
  lang: "en",
});
const labels = computed(() => props.lang === "sr" ? {
  search: "Pretraži linkove",
  placeholder: "Naziv, kategorija ili veb-adresa",
  category: "Kategorija",
  all: "Sve kategorije",
  sort: "Sortiranje",
  newest: "Prvo najnoviji",
  oldest: "Prvo najstariji",
  title: "Naslov (A–Z)",
  showing: "Prikazano",
  of: "od",
  bookmarks: "linkova",
  clear: "Poništi filtere",
  none: "Nema linkova koji odgovaraju filterima.",
  more: "Prikaži još",
  notes: "Bilješke",
} : {
  search: "Search links",
  placeholder: "Title, category or website",
  category: "Category",
  all: "All categories",
  sort: "Sort by",
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title (A–Z)",
  showing: "Showing",
  of: "of",
  bookmarks: "bookmarks",
  clear: "Clear filters",
  none: "No bookmarks match these filters.",
  more: "Show more",
  notes: "Notes",
});
const query = ref("");
const category = ref("all");
const sort = ref<BookmarkSort>("newest");
const limit = ref(50);
const categories = computed(() =>
  [...new Set(props.items.map((item) => item.category))].sort((a, b) => a.localeCompare(b))
);

const matches = computed(() => filterAndSortBookmarks(props.items, {
  query: query.value,
  category: category.value,
  sort: sort.value,
}));
const visible = computed(() => matches.value.slice(0, limit.value));

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  query.value = params.get("q") || "";
  const cat = params.get("category");
  if (cat && categories.value.includes(cat)) category.value = cat;
  const order = params.get("sort");
  if (order === "title" || order === "oldest") sort.value = order;
});

watch([query, category, sort], () => {
  limit.value = 50;
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const key of ["q", "category", "sort"]) url.searchParams.delete(key);
  if (query.value.trim()) url.searchParams.set("q", query.value.trim());
  if (category.value !== "all") url.searchParams.set("category", category.value);
  if (sort.value !== "newest") url.searchParams.set("sort", sort.value);
  window.history.replaceState(null, "", url);
});
</script>

<template>
  <section :aria-label="lang === 'sr' ? 'Pregled sačuvanih linkova' : 'Explore bookmarks'" class="bookmark-browser">
    <div class="bookmark-controls">
      <label class="search-field">
        <span>{{ labels.search }}</span>
        <input v-model="query" type="search" :placeholder="labels.placeholder" autocomplete="off" />
      </label>
      <label>
        <span>{{ labels.category }}</span>
        <select v-model="category">
          <option value="all">{{ labels.all }}</option>
          <option v-for="name in categories" :key="name" :value="name">{{ bookmarkCategoryDisplayLabel(name, lang) }}</option>
        </select>
      </label>
      <label>
        <span>{{ labels.sort }}</span>
        <select v-model="sort">
          <option value="newest">{{ labels.newest }}</option>
          <option value="oldest">{{ labels.oldest }}</option>
          <option value="title">{{ labels.title }}</option>
        </select>
      </label>
    </div>
    <div class="bookmark-summary">
      <p role="status" aria-live="polite">
        {{ labels.showing }} {{ visible.length }} {{ labels.of }} {{ matches.length }} {{ labels.bookmarks }}
      </p>
      <button v-if="query || category !== 'all' || sort !== 'newest'" type="button"
        @click="query = ''; category = 'all'; sort = 'newest'">
        {{ labels.clear }}
      </button>
    </div>
    <ul class="bookmark-list" :aria-label="lang === 'sr' ? 'Sačuvani linkovi' : 'Bookmarks'">
      <li v-for="item in visible" :key="item.id" class="bookmark-entry">
        <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
        <span v-else>{{ item.title }}</span>
        <div class="metadata">
          <time v-if="item.date" :datetime="item.date">{{ item.date }}</time>
          <span>{{ item.category }}</span>
          <a v-if="item.notesUrl" :href="item.notesUrl" :aria-label="`${labels.notes}: ${item.title}`">{{ labels.notes }}</a>
        </div>
      </li>
    </ul>
    <p v-if="matches.length === 0" class="empty-result">{{ labels.none }}</p>
    <button v-if="visible.length < matches.length" class="more-button" type="button"
      @click="limit += 50">
      {{ labels.more }}
    </button>
  </section>
</template>

<style scoped>
.bookmark-browser { margin-top: 1.5rem; }
.bookmark-controls { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(10rem, 14rem) minmax(10rem, 12rem); gap: .75rem; }
.bookmark-controls label { display: grid; gap: .35rem; font-weight: 600; font-size: .9rem; }
.bookmark-controls input, .bookmark-controls select {
  padding: .7rem; width: 100%; font: inherit; min-height: 2.75rem; color: var(--foreground);
  background: var(--surface); border: 1px solid var(--border); border-radius: .45rem;
}
.bookmark-summary { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: center; margin: 1.2rem 0 .4rem; color: var(--muted); }
.bookmark-summary p { margin: 0; }
button { font: inherit; padding: .5rem .7rem; border-radius: .4rem; color: var(--foreground); background: var(--surface); border: 1px solid var(--border); cursor: pointer; }
.bookmark-list { list-style: none; margin: 0; padding: 0; }
.bookmark-entry { padding: .85rem 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
.bookmark-entry > a, .bookmark-entry > span { font-weight: 650; }
.metadata { display: flex; flex-wrap: wrap; gap: 1rem; color: var(--muted); font-size: .83rem; margin-top: .3rem; }
.empty-result { padding: 2rem 0; }
.more-button { display: block; margin: 1.5rem auto; }
@media (max-width: 750px) { .bookmark-controls { grid-template-columns: 1fr; } }
</style>
