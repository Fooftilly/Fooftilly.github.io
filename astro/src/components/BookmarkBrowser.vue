<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

interface Bookmark {
  id: string;
  title: string;
  category: string;
  url: string;
  date: string;
}

const props = defineProps<{ items: Bookmark[] }>();
const query = ref("");
const category = ref("all");
const sort = ref<"newest" | "oldest" | "title">("newest");
const limit = ref(50);
const categories = computed(() =>
  [...new Set(props.items.map((item) => item.category))].sort((a, b) => a.localeCompare(b))
);

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

const matches = computed(() => {
  const terms = fold(query.value.trim()).split(/\s+/).filter(Boolean);
  const filtered = props.items.filter((item) => {
    if (category.value !== "all" && item.category !== category.value) return false;
    const content = fold([item.title, item.category, item.url].join(" "));
    return terms.every((term) => content.includes(term));
  });
  return filtered.sort((a, b) => {
    if (sort.value === "title") return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    const diff = sort.value === "oldest"
      ? a.date.localeCompare(b.date)
      : b.date.localeCompare(a.date);
    return diff || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
});
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
  <section aria-label="Explore bookmarks" class="bookmark-browser">
    <div class="bookmark-controls">
      <label class="search-field">
        <span>Search links</span>
        <input v-model="query" type="search" placeholder="Title, category or website" autocomplete="off" />
      </label>
      <label>
        <span>Category</span>
        <select v-model="category">
          <option value="all">All categories</option>
          <option v-for="name in categories" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label>
        <span>Sort by</span>
        <select v-model="sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title (A–Z)</option>
        </select>
      </label>
    </div>
    <div class="bookmark-summary">
      <p role="status" aria-live="polite">
        Showing {{ visible.length }} of {{ matches.length }} bookmarks
      </p>
      <button v-if="query || category !== 'all' || sort !== 'newest'" type="button"
        @click="query = ''; category = 'all'; sort = 'newest'">
        Clear filters
      </button>
    </div>
    <ul class="bookmark-list" aria-label="Bookmarks">
      <li v-for="item in visible" :key="item.id" class="bookmark-entry">
        <a v-if="item.url" :href="item.url" target="_blank" rel="noopener noreferrer">{{ item.title }}</a>
        <span v-else>{{ item.title }}</span>
        <div class="metadata">
          <time v-if="item.date" :datetime="item.date">{{ item.date }}</time>
          <span>{{ item.category }}</span>
        </div>
      </li>
    </ul>
    <p v-if="matches.length === 0" class="empty-result">No bookmarks match these filters.</p>
    <button v-if="visible.length < matches.length" class="more-button" type="button"
      @click="limit += 50">
      Show more
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
