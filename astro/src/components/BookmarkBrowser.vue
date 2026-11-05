<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { filterAndSortBookmarks, type Bookmark, type BookmarkSort } from "../lib/bookmark-filter.ts";
import { bookmarkCategoryDisplayLabel } from "../lib/bookmark-categories.ts";

const props = withDefaults(defineProps<{ items: Bookmark[]; lang?: "en" | "sh" }>(), {
  lang: "en",
});
const labels = computed(() => props.lang === "sh" ? {
  search: "Pretraga",
  placeholder: "Naziv, kategorija ili adresa",
  category: "Kategorija",
  all: "Sve kategorije",
  sort: "Sortiraj",
  newest: "Najnoviji",
  oldest: "Najstariji",
  title: "Naziv (A–Z)",
  showing: "Prikazano",
  of: "od",
  bookmarks: "linkova",
  clear: "Poništi filtere",
  none: "Nema rezultata.",
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
const sortOptions = computed(() => [
  { value: "newest" as BookmarkSort, label: labels.value.newest },
  { value: "oldest" as BookmarkSort, label: labels.value.oldest },
  { value: "title" as BookmarkSort, label: labels.value.title },
]);

const matches = computed(() => filterAndSortBookmarks(props.items, {
  query: query.value,
  category: category.value,
  sort: sort.value,
  lang: props.lang,
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
  <section :aria-label="lang === 'sh' ? 'Pregled sačuvanih linkova' : 'Explore bookmarks'" class="bookmark-browser">
    <div class="bookmark-controls">
      <label class="search-field">
        <span>{{ labels.search }}</span>
        <input v-model="query" type="search" :placeholder="labels.placeholder" autocomplete="off" />
      </label>
      <fieldset class="bookmark-filter-group sort-filters">
        <legend>{{ labels.sort }}</legend>
        <div class="filter-buttons">
          <button v-for="option in sortOptions" :key="option.value" type="button"
            :data-bookmark-sort="option.value" :aria-pressed="sort === option.value"
            @click="sort = option.value">
            {{ option.label }}
          </button>
        </div>
      </fieldset>
      <fieldset class="bookmark-filter-group category-filters">
        <legend>{{ labels.category }}</legend>
        <div class="filter-buttons">
          <button type="button" data-bookmark-category="all" :aria-pressed="category === 'all'"
            @click="category = 'all'">{{ labels.all }}</button>
          <button v-for="name in categories" :key="name" type="button"
            :data-bookmark-category="name" :aria-pressed="category === name"
            @click="category = name">{{ bookmarkCategoryDisplayLabel(name, lang) }}</button>
        </div>
      </fieldset>
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
    <ul class="bookmark-list" :aria-label="lang === 'sh' ? 'Sačuvani linkovi' : 'Bookmarks'">
      <li v-for="item in visible" :key="item.id" class="bookmark-entry">
        <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
        <span v-else>{{ item.title }}</span>
        <div class="metadata">
          <time v-if="item.date" :datetime="item.date">{{ item.date }}</time>
          <span>{{ bookmarkCategoryDisplayLabel(item.category, lang) }}</span>
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
.bookmark-controls {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "search sort" "category category";
  gap: .75rem 1rem; align-items: end;
}
.search-field { display: grid; grid-area: search; gap: .35rem; min-width: 0; font-weight: 600; font-size: .9rem; }
.bookmark-controls input {
  padding: .7rem; width: 100%; font: inherit; min-height: 2.75rem; color: var(--foreground);
  background: var(--surface); border: 1px solid var(--border); border-radius: 0;
}
.bookmark-filter-group { border: 0; padding: 0; margin: 0; min-width: 0; }
.bookmark-filter-group legend { padding: 0; margin: 0 0 .35rem; font-size: .9rem; font-weight: 600; }
.sort-filters { grid-area: sort; }
.category-filters { grid-area: category; }
.filter-buttons { display: flex; flex-wrap: wrap; gap: .35rem; }
.filter-buttons button { min-height: 2.75rem; padding: .4rem .65rem; line-height: 1.3; }
.filter-buttons button[aria-pressed="true"] {
  background: var(--foreground); color: var(--background);
  border-color: var(--foreground); font-weight: 700;
}
.bookmark-summary { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: center; margin: 1.2rem 0 .4rem; color: var(--muted); }
.bookmark-summary p { margin: 0; }
button { font: inherit; padding: .5rem .7rem; border-radius: 0; color: var(--foreground); background: var(--surface); border: 1px solid var(--border); cursor: pointer; }
.bookmark-list { list-style: none; margin: 0; padding: 0; }
.bookmark-entry { padding: .85rem 0; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
.bookmark-entry > a, .bookmark-entry > span { font-weight: 650; }
.metadata { display: flex; flex-wrap: wrap; gap: 1rem; color: var(--muted); font-size: .83rem; margin-top: .3rem; }
.empty-result { padding: 2rem 0; }
.more-button { display: block; margin: 1.5rem auto; }
@media (max-width: 750px) {
  .bookmark-controls { grid-template-columns: 1fr; grid-template-areas: "search" "sort" "category"; }
}
</style>
