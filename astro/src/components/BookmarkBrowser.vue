<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { filterAndSortBookmarks, visibleBookmarkPage, BOOKMARK_PAGE_SIZE, type Bookmark, type BookmarkSort } from "../lib/bookmark-filter.ts";
import { bookmarkCategoryDisplayLabel } from "../lib/bookmark-categories.ts";
import { bookmarkFilterHref, readBookmarkQueryState } from "../lib/bookmark-query-state.ts";

const props = withDefaults(defineProps<{ items: Bookmark[]; lang?: "en" | "sh" }>(), {
  lang: "en",
});
const labels = computed(() => props.lang === "sh" ? {
  search: "Pretraga",
  placeholder: "Naziv, kategorija, oznake, adresa ili komentar",
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
  details: "Detalji",
} : {
  search: "Search links",
  placeholder: "Title, category, tags, website or comment",
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
  details: "Details",
});
const query = ref("");
const searchInput = ref<HTMLInputElement | null>(null);
async function clearFilters(): Promise<void> {
  query.value = "";
  category.value = "all";
  sort.value = "newest";
  // The reset button is removed when filters become default; keep keyboard
  // focus in the browser controls rather than falling back to the document.
  await nextTick();
  searchInput.value?.focus();
}
const category = ref("all");
const sort = ref<BookmarkSort>("newest");
const limit = ref(BOOKMARK_PAGE_SIZE);
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
const visible = computed(() => visibleBookmarkPage(matches.value, limit.value, hydrated.value));

const hydrated = ref(false);
const syncAddress = (): void => {
  if (!hydrated.value || typeof window === "undefined") return;
  const next = bookmarkFilterHref(window.location.href, {
    query: query.value, category: category.value, sort: sort.value,
  });
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, "", next);
};
const restoreFromAddress = (): void => {
  const restored = readBookmarkQueryState(window.location.search, categories.value);
  query.value = restored.query;
  category.value = restored.category;
  sort.value = restored.sort;
  limit.value = BOOKMARK_PAGE_SIZE;
  hydrated.value = true;
  // Normalize malformed or stale category/sort links without changing history.
  syncAddress();
};

onMounted(() => {
  restoreFromAddress();
  window.addEventListener("popstate", restoreFromAddress);
});
onUnmounted(() => window.removeEventListener("popstate", restoreFromAddress));

watch([query, category, sort], () => {
  limit.value = BOOKMARK_PAGE_SIZE;
  syncAddress();
});
</script>

<template>
  <section :aria-label="lang === 'sh' ? 'Pregled sačuvanih linkova' : 'Explore bookmarks'" class="bookmark-browser">
    <div class="bookmark-controls" :class="{ 'single-category': categories.length <= 1 }">
      <label class="search-field">
        <span>{{ labels.search }}</span>
        <input ref="searchInput" v-model="query" type="search" :placeholder="labels.placeholder" autocomplete="off" />
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
      <fieldset v-if="categories.length > 1" class="bookmark-filter-group category-filters">
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
        @click="clearFilters">
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
          <a v-if="item.detailUrl || item.notesUrl" :href="item.detailUrl || item.notesUrl" :aria-label="`${item.notesUrl ? labels.notes : labels.details}: ${item.title}`" data-bookmark-detail-link>{{ item.notesUrl ? labels.notes : labels.details }}</a>
        </div>
        <ul v-if="item.tags?.length" class="bookmark-tags" :aria-label="lang === 'sh' ? 'Oznake' : 'Tags'">
          <li v-for="tag in item.tags" :key="tag">{{ tag }}</li>
        </ul>
        <p v-if="query.trim() && item.comments" class="bookmark-comment">{{ item.comments }}</p>
      </li>
    </ul>
    <p v-if="matches.length === 0" class="empty-result">{{ labels.none }}</p>
    <button v-if="visible.length < matches.length" class="more-button" type="button"
      @click="limit += BOOKMARK_PAGE_SIZE">
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
.bookmark-controls.single-category { grid-template-areas: "search sort"; }
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
.bookmark-tags { display: flex; flex-wrap: wrap; list-style: none; gap: .3rem; margin: .45rem 0 0; padding: 0; }
.bookmark-tags li { border: 1px solid var(--border); border-radius: 0; font-size: .8rem; padding: .1rem .4rem; }
.bookmark-comment { color: var(--muted); font-size: .88rem; margin: .4rem 0 0; overflow-wrap: anywhere; white-space: pre-wrap; max-width: 70ch; }
.empty-result { padding: 2rem 0; }
.more-button { display: block; margin: 1.5rem auto; }
@media (max-width: 750px) {
  .bookmark-controls { grid-template-columns: 1fr; grid-template-areas: "search" "sort" "category"; }
  .bookmark-controls.single-category { grid-template-areas: "search" "sort"; }
}
</style>
