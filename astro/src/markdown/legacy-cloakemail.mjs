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
    paragraph(node, ctx) {
      // Sätteri may split {{< ... >}} into multiple text/HTML nodes, so
      // a text visitor cannot reliably recognize the entire shortcode.
      if (!ctx.textContent(node).includes("cloakemail")) return;
      const matches = [...ctx.source.matchAll(CLOAK)];
      if (matches.length !== 1) {
        throw new Error("Expected exactly one known cloakemail shortcode");
      }
      const links = rewriteCloakEmailNode({ type: "text", value: matches[0][0] });
      if (links.length !== 1 || links[0].type !== "link") {
        throw new Error("Unsupported mixed-content email shortcode");
      }
      return { type: "paragraph", children: links };
    },
  };
}
