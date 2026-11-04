import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { mediaEntryId } from "./lib/media-model.ts";

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

// Reuse the original English/Serbo-Croatian Markdown rather than maintaining a
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

// Media records belong to this repository, not to any ratings provider.
// One reviewed JSON file per film, TV series or music release enables small PRs.
const media = defineCollection({
  loader: glob({
    pattern: "**/*.json",
    base: "../content/media",
    generateId: ({ entry }) => mediaEntryId(entry),
  }),
  schema: z.object({
    schema: z.literal(1),
    kind: z.enum(["music","films","tv"]),
    title: z.string().min(1).max(250),
    creator: z.string().min(1).max(220).optional(),
    year: z.number().int().min(1800).max(2200).optional(),
    rating: z.number().min(0.5).max(5).refine(n => Number.isInteger(n*2)).optional(),
    status: z.enum(["finished","in-progress","planned"]).optional(),
    notes: z.string().min(1).max(5000).optional(),
    links: z.array(z.object({label:z.string().min(1).max(48),url:z.string().url()}).strict()).max(8).optional(),
  }).strict(),
});

export const collections = { bookmarks, sitePages, media };
