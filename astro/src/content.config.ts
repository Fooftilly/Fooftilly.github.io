import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { mediaEntryId } from "./lib/media-model.ts";
import { PROJECT_SLUG } from "./lib/project-catalog.ts";
import { validateBookmarkTags } from "./lib/bookmark-tags.ts";

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
    tags: z.array(z.string()).superRefine((tags, ctx) => {
      try {
        const canonical = validateBookmarkTags(tags);
        if (canonical.some((tag, index) => tag !== tags[index])) {
          ctx.addIssue({ code: "custom", message: "Bookmark tags must be trimmed and NFC-normalized" });
        }
      } catch (error) {
        ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid bookmark tags" });
      }
    }).optional(),
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

// Static showcase records. One reviewed Markdown entry creates one project route.
const httpsLink=z.string().url().refine(value=>{
  const url=new URL(value);
  return url.protocol==="https:" && !url.username && !url.password;
},"Only HTTPS URLs without credentials are allowed");
const projects=defineCollection({
  loader:glob({
    pattern:"*.md",
    base:"../content/projects",
    generateId:({entry})=>entry.replace(/\.md$/i,""),
  }),
  schema:z.object({
    title:z.string().min(1).max(90),
    summary:z.string().min(10).max(240),
    summarySh:z.string().min(10).max(240).optional(),
    repository:z.string().regex(/^https:\/\/github\.com\/Fooftilly\/[A-Za-z0-9_.-]+$/),
    order:z.number().int().min(0).max(1000),
    status:z.enum(["Work in progress","Maintained","Archived"]).optional(),
    license:z.string().min(2).max(40).regex(/^[A-Za-z0-9.+-]+$/),
    licenseUrl:httpsLink.optional(),
    tags:z.array(z.string().min(1).max(36)).min(1).max(8),
    highlights:z.array(z.string().min(5).max(160)).min(1).max(5),
    links:z.array(z.object({
      label:z.string().min(1).max(64),
      url:httpsLink,
    }).strict()).max(6).optional(),
  }).strict(),
});

export const collections = { bookmarks, sitePages, media, projects };
