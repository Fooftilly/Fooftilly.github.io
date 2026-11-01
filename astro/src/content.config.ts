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

// Reuse the original English/Serbian Markdown rather than maintaining a
// second copy of About text in Astro component files.
const sitePages = defineCollection({
  loader: glob({
    pattern: "*.md",
    base: "../content",
    generateId: ({ entry }) => entry.replace(/\.md$/i, ""),
  }),
  schema: z.object({
    title: z.string(),
    translationKey: z.string().optional(),
    url: z.string().optional(),
    aliases: z.union([z.array(z.string()), z.string()]).optional(),
    summary: z.string().optional(),
    layout: z.string().optional(),
  }).passthrough(),
});

export const collections = { bookmarks, sitePages };
