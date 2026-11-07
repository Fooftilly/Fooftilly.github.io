import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import YAML from "yaml";

// A newly published public route must be validated before artifact upload AND
// probed after manual deployment. These checks are intentionally independent
// from the sitemap generator: a sitemap entry alone is not a release contract.
const repo = new URL("../../", import.meta.url);
const read = path => readFileSync(new URL(path, repo), "utf8");
const production = YAML.parse(read(".github/workflows/astro-pages-cutover.yml"));
const preview = YAML.parse(read(".github/workflows/astro-release-preflight.yml"));
const readiness = read("astro/scripts/release-readiness.mjs");

test("Pages release remains manual-only on master with explicit checked publication", () => {
  assert.deepEqual(Object.keys(production.on), ["workflow_dispatch"]);
  assert.equal(production.on.workflow_dispatch.inputs.publish.type, "boolean");
  assert.equal(production.on.workflow_dispatch.inputs.publish.default, false);
  for (const job of [production.jobs.build, production.jobs.deploy]) {
    assert.match(job.if, /github\.ref == 'refs\/heads\/master'/);
    assert.match(job.if, /inputs\.publish == true/);
    assert.match(job.if, /github\.event_name == 'workflow_dispatch'/);
  }
  assert.deepEqual(Object.keys(preview.on), ["workflow_dispatch"]);
  assert.match(preview.jobs["release-audit"].if, /github\.ref == 'refs\/heads\/master'/);
  assert.equal(preview.permissions.pages, undefined,
    "Read-only preflight may never receive Pages write permission");
});

test("deployed sitemap is checked against the exact validated build artifact", () => {
  const digest = production.jobs.build.steps.find(step => step.id === "sitemap");
  const live = production.jobs.deploy.steps.find(step =>
    step.name === "Verify the public site serves this deployment revision");
  assert.ok(digest && live, "Release digest and live verification must exist");
  assert.equal(production.jobs.build.outputs.sitemap_sha256,
    "${{ steps.sitemap.outputs.sha256 }}");
  assert.match(digest.run, /sha256sum dist\/sitemap\.xml/);
  assert.equal(live.env.EXPECTED_SITEMAP_SHA256,
    "${{ needs.build.outputs.sitemap_sha256 }}");
  assert.match(live.run, /sha256sum "\$live_sitemap"/);
  assert.match(live.run, /observed_sitemap_sha256.*EXPECTED_SITEMAP_SHA256/);
  assert.match(live.run, /::error::Live sitemap differs/);
});
test("both new tag indexes are covered before packaging, in read-only preflight and after deploy", () => {
  const build = production.jobs.build.steps.find(step =>
    step.name === "Validate every source and generated route")?.run;
  const deploy = production.jobs.deploy.steps.find(step =>
    step.name === "Verify the public site serves this deployment revision")?.run;
  const readOnly = preview.jobs["release-audit"].steps.find(step =>
    step.name === "Confirm this workflow cannot deploy")?.run;
  assert.ok(build && deploy && readOnly, "Release verification steps must exist");
  for (const route of ["/bookmarks/tags/", "/sh/bookmarks/tags/"]) {
    const output = route.slice(1) + "index.html";
    assert.ok(build.includes("test -s dist/" + output),
      "Before-upload gate omits " + route);
    assert.ok(readOnly.includes("test -s astro/dist/" + output),
      "Read-only preview gate omits " + route);
    assert.ok(readiness.includes('"' + output + '"'),
      "Release readiness manifest omits " + route);
    assert.ok(deploy.includes(route + " "),
      "Post-deploy live route probe omits " + route);
  }
});
