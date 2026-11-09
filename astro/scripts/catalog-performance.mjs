/** Deterministic static-output baseline; no content source mutations. */
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

export const CATALOG_ROUTES = Object.freeze([
  { path: "/films/", kind: "media" },
  { path: "/music/", kind: "media" },
  { path: "/bookmarks/", kind: "bookmarks" },
]);

export function countStaticRows(html, kind) {
  if (kind === "media") return (html.match(/<tr\b[^>]*\bdata-media-row(?:\s|=|>)/g) ?? []).length;
  if (kind === "bookmarks") return (html.match(/<li\b[^>]*\bclass="[^"]*\bbookmark-entry\b[^"]*"/g) ?? []).length;
  throw new Error("Unknown catalog kind: " + kind);
}

export function measureStaticPage(html, kind) {
  const bytes = Buffer.from(html, "utf8");
  // HTML attribute length is a source-side proxy for Astro's serialized island
  // payload, not the decompressed JS heap size after hydration.
  const props = [...html.matchAll(/<astro-island\b[^>]*?\bprops="([^"]*)"/gs)];
  const islandPropBytes = props.reduce((sum, match) => sum + Buffer.byteLength(match[1]), 0);
  return {
    html_bytes: bytes.length,
    html_gzip_bytes: gzipSync(bytes, { level: 6 }).length,
    html_brotli_bytes: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }).length,
    island_props_attribute_bytes: islandPropBytes,
    island_count: props.length,
    ssr_rows: countStaticRows(html, kind),
  };
}

export function median(values) {
  if (!values.length || values.some(value => !Number.isFinite(value)))
    throw new Error("Expected nonempty finite samples");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
