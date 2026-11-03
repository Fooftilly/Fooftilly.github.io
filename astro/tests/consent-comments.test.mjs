import test from "node:test";
import assert from "node:assert/strict";
import { mountConsentComments, GISSCUS_URL } from "../src/lib/consent-comments.ts";

test("Giscus script is not created until the visitor explicitly clicks", () => {
  const added = [];
  let listener;
  const button = {
    hidden: false,
    addEventListener(type, callback) {
      assert.equal(type, "click");
      listener = callback;
    },
    setAttribute(name, value) { this[name] = value; },
  };
  const container = {
    querySelector() { return added.find(item => item.dataset?.giscusOptIn) ?? null; },
    appendChild(item) { added.push(item); },
  };
  const section = {
    querySelector(selector) {
      return selector === "[data-load-comments]" ? button : container;
    },
  };
  const root = { querySelectorAll: () => [section] };
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({
    dataset: {}, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
  }) };
  try {
    mountConsentComments(root);
    assert.equal(added.length, 0, "No third-party resource before opt-in");
    assert.equal(typeof listener, "function");
    listener();
    assert.equal(added.length, 1);
    assert.equal(added[0].src, GISSCUS_URL);
    assert.equal(added[0].attributes["data-mapping"], "title");
    assert.equal(added[0].attributes["data-repo"], "Fooftilly/Fooftilly.github.io");
    assert.equal(button.hidden, true);
    assert.equal(button["aria-expanded"], "true");
    listener();
    assert.equal(added.length, 1, "Repeated click must not load twice");
  } finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
});
