<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { projectPath } from "../lib/project-catalog.ts";
import { filterProjects, projectSearchHref, projectStatusLabel, projectTagHref, readProjectSearchQuery, readProjectTag, type PublicProject } from "../lib/project-search.ts";

const props = withDefaults(defineProps<{ projects: PublicProject[]; lang?: "en" | "sh" }>(), { lang: "en" });
const hydrated = ref(false);
const query = ref("");
const tag = ref("");
const availableTags = computed(() => [...new Set(props.projects.flatMap(project => project.tags))]
  .sort((a,b)=>a.localeCompare(b,"en",{sensitivity:"base"})));
const searchInput = ref<HTMLInputElement | null>(null);
const labels = computed(() => props.lang === "sh" ? {
  label: "Pretraži projekte",
  placeholder: "Naziv, opis ili tehnologija",
  count: "Prikazano",
  of: "od",
  projects: "projekata",
  clear: "Poništi pretragu",
  empty: "Nema projekata za ovu pretragu.",
  source: "Izvorni kod",
  tag: "Oznaka",
  clearTag: "Ukloni oznaku",
} : {
  label: "Search projects",
  placeholder: "Name, description or technology",
  count: "Showing",
  of: "of",
  projects: "projects",
  clear: "Clear search",
  empty: "No projects match this search.",
  source: "Source code",
  tag: "Tag",
  clearTag: "Clear tag",
});
const visible = computed(() => hydrated.value ? filterProjects(props.projects, query.value, tag.value) : props.projects);
function syncAddress(): void {
  if (!hydrated.value || typeof window === "undefined") return;
  const next = projectSearchHref(window.location.href, query.value, tag.value);
  const current = window.location.pathname + window.location.search + window.location.hash;
  if (next !== current) window.history.replaceState(window.history.state, "", next);
  // replaceState never emits popstate. Keep the canonical language link fresh
  // for click, keyboard activation, middle-click and context-menu sharing.
  window.dispatchEvent(new Event("peroniko:search-state-change"));
}
function restoreFromAddress(): void {
  query.value = readProjectSearchQuery(window.location.search);
  tag.value = readProjectTag(window.location.search, availableTags.value);
  hydrated.value = true;
  syncAddress();
}
onMounted(() => {
  restoreFromAddress();
  window.addEventListener("popstate", restoreFromAddress);
  window.addEventListener("pageshow", restoreFromAddress);
});
onUnmounted(() => {
  window.removeEventListener("popstate", restoreFromAddress);
  window.removeEventListener("pageshow", restoreFromAddress);
});
watch([query,tag], syncAddress);
async function clearSearch(): Promise<void> {
  query.value = "";
  tag.value = "";
  await nextTick();
  searchInput.value?.focus();
}
</script>

<template>
  <section class="project-browser" :aria-label="lang === 'sh' ? 'Pregled projekata' : 'Project directory'">
    <div v-if="hydrated" class="project-controls">
      <label>
        {{ labels.label }}
        <input ref="searchInput" v-model="query" type="search" data-project-search
          :placeholder="labels.placeholder" autocomplete="off" />
      </label>
      <p role="status" aria-live="polite" data-project-count>
        {{ labels.count }} {{ visible.length }} {{ labels.of }} {{ projects.length }} {{ labels.projects }}
      </p>
      <button v-if="query || tag" type="button" data-project-clear @click="clearSearch">
        {{ labels.clear }}
      </button>
    </div>
    <p v-if="tag" class="active-project-tag" data-project-active-tag>
      {{ labels.tag }}: <strong>{{ tag }}</strong>
      <button type="button" data-project-clear-tag @click="tag = ''">{{ labels.clearTag }}</button>
    </p>
    <ul class="project-cards">
      <li v-for="project in visible" :key="project.id" class="project-card">
        <h3><a :href="projectPath(project.id)">{{ project.title }}</a></h3>
        <p>{{ lang === "sh" && project.summarySh ? project.summarySh : project.summary }}</p>
        <p v-if="project.status" class="project-status">{{ projectStatusLabel(project.status, lang) }}</p>
        <ul class="project-tags" :aria-label="project.title + (lang === 'sh' ? ' — tehnologije' : ' technologies')">
          <li v-for="label in project.tags" :key="label"><a :href="projectTagHref(label,lang)" data-project-tag-link>{{ label }}</a></li>
        </ul>
        <p class="project-source">
          <a :href="project.repository" rel="noopener noreferrer"
            :aria-label="labels.source + ': ' + project.title">{{ labels.source }}</a>
        </p>
      </li>
    </ul>
    <p v-if="hydrated && visible.length === 0" role="status" data-project-empty>{{ labels.empty }}</p>
  </section>
</template>

<style scoped>
.project-controls{display:flex;align-items:end;flex-wrap:wrap;gap:.65rem 1rem;margin:1rem 0 1.5rem}
.project-controls label{display:grid;gap:.3rem;min-width:min(100%,16rem);flex:1 1 16rem;font-size:.9rem;font-weight:600}
.project-controls input{width:100%;min-height:2.75rem;padding:.65rem;border:1px solid var(--border);background:var(--surface);color:var(--foreground);font:inherit;border-radius:0}
.project-controls p{margin:0;color:var(--muted)}
.project-controls button{min-height:2.75rem;padding:.6rem .8rem;border:1px solid var(--border);background:var(--surface);color:var(--foreground);border-radius:0;font:inherit;cursor:pointer}
.project-cards{list-style:none;padding:0;margin:1rem 0 2rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));gap:1rem}
.project-card{background:var(--surface);border:1px solid var(--border);padding:1.1rem;min-width:0;border-radius:0}
.project-card h3{font-size:1.16rem;margin:0 0 .6rem;overflow-wrap:anywhere}
.project-card p{margin:.45rem 0;line-height:1.5}
.project-status{color:var(--muted);font-size:.9rem}
.project-source{margin-top:.9rem}
.project-tags{display:flex;flex-wrap:wrap;list-style:none;gap:.4rem;margin:1rem 0 0;padding:0}
.project-tags li{font-size:.8rem;border:1px solid var(--border);padding:.2rem .45rem;border-radius:0}
.project-tags a{color:inherit;text-decoration:underline;text-underline-offset:.2em}
.active-project-tag{display:flex;align-items:center;flex-wrap:wrap;gap:.5rem}
.active-project-tag button{border-radius:0;border:1px solid var(--border);padding:.35rem .6rem;color:var(--foreground);background:var(--surface);font:inherit;cursor:pointer}
</style>
