import test from "node:test";
import assert from "node:assert/strict";
import { rewriteCloakEmailNode, satteriLegacyCloakEmail } from "../src/markdown/legacy-cloakemail.mjs";

test("English Hugo mail shortcode becomes a safe labeled link with subject", () => {
  const text = '{{< cloakemail address="example@example.org" display="Send email" query="subject=Hello World" >}}';
  const result = rewriteCloakEmailNode({ type: "text", value: text });
  assert.equal(result.length, 1);
  assert.equal(result[0].type, "link");
  assert.equal(result[0].url, "mailto:example@example.org?subject=Hello%20World");
  assert.equal(result[0].children[0].value, "Send email");
});
test("surrounding text is preserved", () => {
  const text = 'Before {{< cloakemail address="a@b.co" display="Contact" query="subject=Hello" >}} after';
  const result = rewriteCloakEmailNode({ type: "text", value: text });
  assert.deepEqual(result.map(x => x.type), ["text", "link", "text"]);
  assert.equal(result[0].value, "Before ");
  assert.equal(result[2].value, " after");
});
test("unsupported email syntax and unsafe query keys are rejected", () => {
  assert.throws(() => rewriteCloakEmailNode({ type:"text", value:'{{< cloakemail address="bad" display="Me" query="subject=OK" >}}' }), /Invalid/);
  assert.throws(() => rewriteCloakEmailNode({ type:"text", value:'{{< cloakemail address="a@b.co" display="Me" query="body=secret" >}}' }), /Unsupported/);
  assert.throws(() => rewriteCloakEmailNode({ type:"text", value:"{{< cloakemail unknown=value >}}" }), /Unsupported/);
});

test("Sätteri visitor preserves the introduction sharing a paragraph with shortcode", () => {
  const source = `---
title: About
---
My personal website. Made by me.
{{< cloakemail address="a@b.co" display="Contact" query="subject=Hello" >}}`;
  const visitor = satteriLegacyCloakEmail();
  const replacement = visitor.paragraph(
    { type: "paragraph", children: [] },
    { source, textContent: () => "My personal website. Made by me. {{< cloakemail" },
  );
  assert.equal(replacement.type, "paragraph");
  assert.deepEqual(replacement.children.map(x => x.type), ["text", "link"]);
  assert.equal(replacement.children[0].value, "My personal website. Made by me. ");
  assert.equal(replacement.children[1].url, "mailto:a@b.co?subject=Hello");
});
