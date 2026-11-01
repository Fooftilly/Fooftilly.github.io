<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { BOOKMARK_CATEGORIES } from "../lib/bookmark-categories.ts";
import {
  composeBookmarkDraft,
  githubNewFileUrl,
  type BookmarkDraftInput,
  type ExistingBookmarkRef,
} from "../lib/bookmark-draft.ts";

const props = defineProps<{ existing: ExistingBookmarkRef[] }>();
const title = ref("");
const url = ref("");
const category = ref("Resource");
const date = ref("");
const comments = ref("");
const notes = ref("");
const status = ref("");
const editorLimit = 6000;
// Paste this as the URL of a browser bookmark to capture the current page.
// The target only becomes available once Astro is published at the domain.
const captureBookmarklet = 'javascript:(()=>{const u=new URL("https://www.peroniko.xyz/new-bookmark/");u.searchParams.set("url",location.href);u.searchParams.set("title",document.title);window.open(u.href,"_blank","noopener");})();';

onMounted(() => {
  const parameters = new URLSearchParams(window.location.search);
  url.value = (parameters.get("url") ?? "").slice(0, 2048);
  title.value = (parameters.get("title") ?? "").slice(0, 200);
  const now = new Date();
  date.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
});

const result = computed(() => {
  const input: BookmarkDraftInput = {
    title: title.value, url: url.value, category: category.value,
    date: date.value, comments: comments.value, notes: notes.value,
  };
  try { return { draft: composeBookmarkDraft(input, props.existing), error: "" }; }
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
    <p>Prepare a Markdown bookmark from your browser, then review and commit it on GitHub. This page has no GitHub write access, account session, or stored draft.</p>
    <details class="capture-help">
      <summary>Capture a page with a browser bookmarklet</summary>
      <p>After Astro launches on this domain, create a browser bookmark and set its URL to the copied bookmarklet. Clicking it on any web page opens this form with its URL and title filled in. It does not save anything automatically.</p>
      <button type="button" @click="copy(captureBookmarklet, 'Bookmarklet')">Copy capture bookmarklet</button>
    </details>

    <div class="draft-fields">
      <label>
        Web address
        <input v-model="url" type="url" autocomplete="url" required maxlength="2048" placeholder="https://example.com/article" />
      </label>
      <label>
        Bookmark title
        <input v-model="title" type="text" required maxlength="200" placeholder="Page title" />
      </label>
      <div class="draft-fields-two">
        <label>
          Category
          <select v-model="category">
            <option v-for="item in BOOKMARK_CATEGORIES" :key="item.section" :value="item.section">
              {{ item.label }}
            </option>
          </select>
        </label>
        <label>
          Saved date
          <input v-model="date" type="date" required />
        </label>
      </div>
      <label>
        Short comment (optional)
        <textarea v-model="comments" rows="2" maxlength="1200" placeholder="Why this link is worth saving" />
      </label>
      <label>
        Markdown notes (optional)
        <textarea v-model="notes" rows="4" maxlength="5000" placeholder="Longer personal notes" />
      </label>
    </div>

    <p class="privacy-note">Bookmarks committed to this public repository are publicly visible. Do not enter passwords, access tokens, private addresses, or confidential notes.</p>
    <p v-if="result.error" class="validation" role="status">{{ result.error }}</p>

    <div v-if="result.draft" class="output">
      <h2>Ready to add</h2>
      <p><strong>GitHub file:</strong> <code>{{ result.draft.path }}</code></p>
      <p v-if="result.draft.duplicateIds.length" class="duplicate" role="alert">
        Possible duplicate: this URL already appears in {{ result.draft.duplicateIds.join(", ") }}. Review before committing.
      </p>
      <label>
        Generated Markdown
        <textarea :value="result.draft.markdown" readonly rows="10" spellcheck="false" />
      </label>
      <div class="actions">
        <button type="button" @click="copy(result.draft!.markdown, 'Markdown')">Copy Markdown</button>
        <button type="button" @click="copy(result.draft!.filename, 'Filename')">Copy filename</button>
        <a :href="editorHref" target="_blank" rel="noopener noreferrer">Open GitHub new-file editor</a>
      </div>
      <p class="help">GitHub sign-in is required to create the file. {{ prefilledEditor
        ? "The editor link attempts to prefill the filename and content; verify both before committing."
        : "The draft is too long for a reliable prefilled link. Copy the filename and Markdown into GitHub manually."
      }} Create a separate branch and submit a pull request when prompted. Nothing is committed automatically.</p>
    </div>
    <p role="status" aria-live="polite" class="copy-status">{{ status }}</p>
  </section>
</template>

<style scoped>
.new-bookmark { max-width: 52rem; }
.draft-fields { display: grid; gap: 1rem; margin: 1.5rem 0; }
.draft-fields-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
label { display: grid; gap: .4rem; font-weight: 650; }
input, select, textarea {
  width: 100%; min-height: 2.8rem; padding: .65rem;
  font: inherit; background: var(--surface); color: var(--foreground);
  border: 1px solid var(--border); border-radius: .4rem;
}
textarea { min-height: 5rem; resize: vertical; font-weight: normal; }
.output { border-top: 1px solid var(--border); padding-top: 1.25rem; }
.capture-help { margin: 1rem 0; }
.capture-help summary { cursor: pointer; }
.capture-help button { padding: .6rem .8rem; border: 1px solid var(--border); border-radius: .4rem; background: var(--surface); color: var(--foreground); cursor: pointer; }
.output label textarea { min-height: 12rem; font-family: ui-monospace, monospace; }
.output code { overflow-wrap: anywhere; font-size: .9rem; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; }
.actions button, .actions a {
  color: var(--foreground); background: var(--surface);
  border: 1px solid var(--border); border-radius: .45rem;
  padding: .7rem 1rem; font: inherit; cursor: pointer;
}
.actions a { color: var(--accent); }
.privacy-note, .help, .copy-status { color: var(--muted); font-size: .92rem; }
.validation, .duplicate { color: var(--foreground); border-left: 3px solid var(--accent); padding-left: .75rem; }
@media (max-width: 35rem) { .draft-fields-two { grid-template-columns: minmax(0, 1fr); } }
</style>
