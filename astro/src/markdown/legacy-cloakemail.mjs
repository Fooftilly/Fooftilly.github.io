/**
 * Convert the two known Hugo cloakemail shortcodes in about(.sr).md to
 * ordinary Markdown links, without copying the bilingual source content.
 *
 * Narrowly scoped: fail for unrecognized cloakemail syntax rather than
 * publishing raw Hugo template text on an Astro page.
 */
const CLOAK = /\{\{<\s*cloakemail\s+address="([^"]+)"\s+display="([^"]+)"\s+query="([^"]+)"\s*>\}\}/g;

export function rewriteCloakEmailNode(node) {
  if (node.type !== "text" || !node.value?.includes("cloakemail")) return [node];
  const original = node.value;
  const transformed = [];
  let index = 0;
  for (const match of original.matchAll(CLOAK)) {
    const [source, email, label, query] = match;
    if (match.index > index) transformed.push({ type: "text", value: original.slice(index, match.index) });
    if (!/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) {
      throw new Error("Invalid cloakemail address in legacy Markdown");
    }
    const parts = new URLSearchParams(query);
    const subject = parts.get("subject");
    if (subject === null || [...parts.keys()].some((key) => key !== "subject")) {
      throw new Error("Unsupported cloakemail query in legacy Markdown");
    }
    transformed.push({
      type: "link",
      url: `mailto:${email}?subject=${encodeURIComponent(subject)}`,
      title: null,
      children: [{ type: "text", value: label }],
    });
    index = match.index + source.length;
  }
  if (index === 0) throw new Error("Unsupported cloakemail shortcode in legacy Markdown");
  if (index < original.length) transformed.push({ type: "text", value: original.slice(index) });
  return transformed;
}

/**
 * Sätteri's native MDAST visitor API. Replaces the matched node in the
 * processor; no Unified/remark compatibility package is required.
 */
export function satteriLegacyCloakEmail() {
  return {
    name: "astro-legacy-cloakemail",
    text(node, ctx) {
      if (!node.value?.includes("cloakemail")) return;
      ctx.replaceNode(node, rewriteCloakEmailNode(node));
    },
  };
}
