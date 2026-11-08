<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { BOOKMARK_CATEGORIES, draftCategoryFromSlug } from "../lib/bookmark-categories.ts";
import { bookmarkDetailPath } from "../lib/bookmark-path.ts";
import { captureBookmarklet, readBookmarkCapture } from "../lib/bookmark-capture.ts";
import { appendBookmarkTag, parseBookmarkTags } from "../lib/bookmark-tags.ts";
import {
  composeBookmarkDraft,
  githubNewFileUrl,
  type BookmarkDraftInput,
  type ExistingBookmarkRef,
} from "../lib/bookmark-draft.ts";

const props = withDefaults(defineProps<{
  existing: ExistingBookmarkRef[];
  suggestedTags?: string[];
}>(), { suggestedTags: () => [] });
const title = ref("");
const url = ref("");
const category = ref(draftCategoryFromSlug(null));
const date = ref("");
const comments = ref("");
const tags = ref("");
const notes = ref("");
const status = ref("");
const displayedSuggestions = computed(() => props.suggestedTags.slice(0, 12));
const selectedTagKeys = computed(() => new Set(
  tags.value.split(",").map(tag => tag.trim().normalize("NFC").toLowerCase()).filter(Boolean)
));
function addSuggestedTag(suggested: string): void {
  if (selectedTagKeys.value.has(suggested.normalize("NFC").toLowerCase())) return;
  try {
    tags.value = appendBookmarkTag(tags.value, suggested);
  } catch (error) {
    status.value = error instanceof Error ? error.message : "Invalid tag.";
  }
}
const editorLimit = 4000; // Conservative URL length across browsers and GitHub redirects.
// A bookmarklet capture uses #url=/title= so the captured URL never reaches
// the static hosting server as an HTTP request query string.
onMounted(() => {
  const capture = readBookmarkCapture(window.location.search, window.location.hash);
  url.value = capture.url;
  title.value = capture.title;
  category.value = draftCategoryFromSlug(capture.category);
  const now = new Date();
  date.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
});

const result = computed(() => {
  const input: BookmarkDraftInput = {
    title: title.value, url: url.value, category: category.value,
    date: date.value, comments: comments.value, notes: notes.value,
  };
  try {
    input.tags = parseBookmarkTags(tags.value);
    return { draft: composeBookmarkDraft(input, props.existing), error: "" };
  }
  catch (error) { return { draft: null, error: error instanceof Error ? error.message : "Invalid bookmark." }; }
});

const editorHref = computed(() => {
  const draft = result.value.draft;
  if (!draft) return "";
  const link = githubNewFileUrl(draft.path, draft.markdown);
  // URL-length limits vary; for longer drafts open the empty GitHub editor
  // and rely on explicit filename/Markdown copy instead.
  return link.length < editorLimit
    ? link
    : "https://github.com/Fooftilly/Fooftilly.github.io/new/master";
});
const prefilledEditor = computed(() =>
  !!result.value.draft && githubNewFileUrl(result.value.draft.path, result.value.draft.markdown).length < editorLimit
);

async function copy(value: string, description: string) {
  try {
    await navigator.clipboard.writeText(value);
    status.value = description + " copied to clipboard.";
  } catch {
    status.value = "Clipboard unavailable. Select and manually copy the generated text.";
  }
}
</script>

<template>
  <section class="new-bookmark" aria-labelledby="draft-heading">
    <h1 id="draft-heading">New bookmark</h1>
    <p>Create a bookmark draft for GitHub review. Nothing is saved here.</p>
    <details class="capture-help">
      <summary>Capture a page with a browser bookmarklet</summary>
      <p>Save the bookmarklet in your browser to fill in the URL and title from any page. Captured details stay in the page address fragment, not the hosting server request.</p>
      <button type="button" @click="copy(captureBookmarklet, 'Bookmarklet')">Copy capture bookmarklet</button>
    </details>

    <div class="draft-fields">
      <label>
        Web address
        <input v-model="url" type="url" autocomplete="url" required placeholder="https://example.com/article" />
      </label>
      <label>
        Bookmark title
        <input v-model="title" type="text" required placeholder="Page title" />
      </label>
      <fieldset class="category-field">
        <legend>Category</legend>
        <div class="category-buttons" data-bookmark-categories>
          <button v-for="item in BOOKMARK_CATEGORIES" :key="item.section" type="button"
            :data-bookmark-category="item.section" :aria-pressed="category === item.section"
            @click="category = item.section">
            {{ item.label }}
          </button>
        </div>
      </fieldset>
      <label class="saved-date">
        Saved date
        <input v-model="date" type="date" required />
      </label>
      <label>
        Short comment (optional)
        <textarea v-model="comments" rows="2" maxlength="1200" placeholder="Why this link is worth saving" />
      </label>
      <label>
        Public tags (optional, comma-separated)
        <input v-model="tags" type="text" data-bookmark-tag-input autocomplete="off"
               placeholder="Separate tag names with commas" />
      </label>
      <div v-if="displayedSuggestions.length" class="tag-suggestions">
        <p>Existing tags</p>
        <div class="tag-suggestion-buttons">
          <button v-for="suggested in displayedSuggestions" :key="suggested" type="button"
            :data-bookmark-suggest-tag="suggested" :disabled="selectedTagKeys.has(suggested.normalize('NFC').toLowerCase())"
            :aria-label="`Add tag: ${suggested}`" @click="addSuggestedTag(suggested)">
            {{ suggested }}
          </button>
        </div>
      </div>
      <label>
        Markdown notes (optional)
        <textarea v-model="notes" rows="4" maxlength="5000" placeholder="Longer personal notes" />
      </label>
    </div>

    <p class="privacy-note">Entries are public. Do not include passwords, private addresses or confidential notes.</p>
    <p v-if="result.error" class="validation" role="status">{{ result.error }}</p>

    <div v-if="result.draft" class="output">
      <h2>Ready to add</h2>
      <p><strong>GitHub file:</strong> <code>{{ result.draft.path }}</code></p>
      <div v-if="result.draft.duplicateIds.length" class="duplicate" role="alert">
        <p>Possible duplicate: this URL already appears in existing bookmarks. Review before committing:</p>
        <ul>
          <li v-for="id in result.draft.duplicateIds" :key="id">
            <a :href="bookmarkDetailPath(id)" target="_blank" rel="noopener noreferrer"
              data-bookmark-duplicate-link :aria-label="`View existing bookmark: ${id}`">{{ id }}</a>
          </li>
        </ul>
      </div>
      <label>
        Generated Markdown
        <textarea :value="result.draft.markdown" readonly rows="10" spellcheck="false" />
      </label>
      <div class="actions">
        <button type="button" @click="copy(result.draft!.markdown, 'Markdown')">Copy Markdown</button>
        <button type="button" @click="copy(result.draft!.path, 'File path')">Copy full file path</button>
        <a :href="editorHref" target="_blank" rel="noopener noreferrer">Open GitHub new-file editor</a>
      </div>
      <p class="help">Only repository collaborators can submit pull requests. {{ prefilledEditor
        ? "Check the filename and content in GitHub. Copy them manually if prefill fails."
        : "Copy the file path and Markdown into GitHub."
      }} Create a branch and open a pull request.</p>
    </div>
    <p role="status" aria-live="polite" class="copy-status">{{ status }}</p>
  </section>
</template>

<style scoped>
.new-bookmark { max-width: 52rem; }
.draft-fields { display: grid; gap: 1rem; margin: 1.5rem 0; }
label { display: grid; gap: .4rem; font-weight: 650; }
.saved-date { max-width: 16rem; }
.category-field { min-width: 0; margin: 0; padding: 0; border: 0; }
.category-field legend { margin: 0 0 .4rem; padding: 0; font-weight: 650; }
.category-buttons { display: flex; flex-wrap: wrap; gap: .4rem; }
.category-buttons button {
  min-height: 2.8rem; padding: .55rem .75rem; font: inherit;
  color: var(--foreground); background: var(--surface);
  border: 1px solid var(--border); border-radius: 0; cursor: pointer;
}
.category-buttons button[aria-pressed="true"] {
  background: var(--accent); color: var(--accent-contrast);
  border-color: var(--accent); font-weight: 700;
}
input, textarea {
  width: 100%; min-height: 2.8rem; padding: .65rem;
  font: inherit; background: var(--surface); color: var(--foreground);
  border: 1px solid var(--border); border-radius: 0;
}
textarea { min-height: 5rem; resize: vertical; font-weight: normal; }
.output { border-top: 1px solid var(--border); padding-top: 1.25rem; }
.capture-help { margin: 1rem 0; }
.tag-suggestions p { margin: 0 0 .4rem; color: var(--muted); font-size: .9rem; }
.tag-suggestion-buttons { display: flex; flex-wrap: wrap; gap: .4rem; }
.tag-suggestion-buttons button { padding: .4rem .6rem; border: 1px solid var(--border); border-radius: 0; background: var(--surface); color: var(--foreground); font: inherit; cursor: pointer; }
.tag-suggestion-buttons button:disabled { opacity: .5; cursor: default; }
.capture-help summary { cursor: pointer; }
.capture-help button { padding: .6rem .8rem; border: 1px solid var(--border); border-radius: 0; background: var(--surface); color: var(--foreground); cursor: pointer; }
.output label textarea { min-height: 12rem; font-family: ui-monospace, monospace; }
.output code { overflow-wrap: anywhere; font-size: .9rem; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
.actions button, .actions a {
  color: var(--foreground); background: var(--surface);
  border: 1px solid var(--border); border-radius: 0;
  padding: .7rem 1rem; font: inherit; cursor: pointer;
}
.actions a { color: var(--accent); }
.privacy-note, .help, .copy-status { color: var(--muted); font-size: .92rem; }
.validation, .duplicate { color: var(--foreground); border-left: 3px solid var(--accent); padding-left: .75rem; }
.duplicate ul { margin: .5rem 0; padding-left: 1.5rem; }
.duplicate li { margin: .3rem 0; overflow-wrap: anywhere; }
.duplicate a { color: var(--accent); }

</style>
