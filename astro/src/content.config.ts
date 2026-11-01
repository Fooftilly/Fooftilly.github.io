import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// Load the authoritative legacy Markdown in place; no mass content rewrite.
// Folder _index.md files are section metadata, not bookmark records.
const bookmarks = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "../content/bookmarks",
    generateId: ({ entry }) => entry.replace(/\.md$/i, "").replaceAll("\\", "/"),
  }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date().optional(),
    link: z.string().optional(),
    comments: z.string().optional(),
    draft: z.boolean().optional(),
  }).passthrough(),
});

export const collections = { bookmarks };
