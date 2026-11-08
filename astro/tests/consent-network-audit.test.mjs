import test from "node:test";
import assert from "node:assert/strict";
import { isExternalHttpRequest, networkAuditLabel } from "../scripts/consent-network-audit.mjs";

const origin = "http://127.0.0.1:38491";

test("pre-consent network audit permits only actual same-origin HTTP requests", () => {
  for (const url of [
    origin + "/_astro/entry.js", origin + "/assets/app.css?version=2",
    "data:image/png;base64,iVBORw0KGgo=", "blob:" + origin + "/8c9d",
    "about:blank",
  ]) assert.equal(isExternalHttpRequest(url, origin), false, url);

  for (const url of [
    "https://www.googletagmanager.com/gtag/js?id=G-PUBLIC",
    "https://fonts.googleapis.com/css?family=Test",
    "https://giscus.app/client.js",
    "http://127.0.0.1:38492/other-port",
    "http://localhost:38491/different-origin",
    "https://www.peroniko.xyz/anything",
  ]) assert.equal(isExternalHttpRequest(url, origin), true, url);
});

test("CI diagnostic never records URL search strings, fragments or embedded credentials", () => {
  assert.equal(networkAuditLabel("https://private:password@example.org/track?token=secret#private"),
    "https://example.org/track");
});
