import test from "node:test";
import assert from "node:assert/strict";
import { projectPath, sortProjects } from "../src/lib/project-catalog.ts";

test("project slugs are strict, lowercase and safe for public routes", () => {
  assert.equal(projectPath("example-project"), "/projects/example-project/");
  for (const unsafe of ["../x", "UPPER", "project/x", "", "--x", "hello world", "x?y=1"]) {
    assert.throws(() => projectPath(unsafe), /Invalid project slug/);
  }
});

test("adding, removing and reordering projects changes only current content routes", () => {
  const entries = [
    {id: "alpha", data: {title: "Alpha", order: 1}},
    {id: "future-project", data: {title: "Future", order: 4}},
    {id: "another-project", data: {title: "Another", order: 2}},
    {id: "third-project", data: {title: "Third", order: 3}},
  ];
  const original = entries.map(item => item.id);
  assert.deepEqual(sortProjects(entries).map(x => projectPath(x.id)), [
    "/projects/alpha/", "/projects/another-project/",
    "/projects/third-project/", "/projects/future-project/",
  ]);
  assert.deepEqual(entries.map(item => item.id), original, "Sorting must not mutate the source");
  assert.deepEqual(sortProjects(entries.slice(1)).map(item => item.id),
    ["another-project", "third-project", "future-project"], "Removing an item is permitted");
  assert.deepEqual(sortProjects([]), [], "An empty optional collection is valid");
});
