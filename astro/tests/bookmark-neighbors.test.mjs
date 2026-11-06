import test from "node:test";
import assert from "node:assert/strict";
import { bookmarkNeighborMap } from "../src/lib/bookmark-neighbors.ts";
import { BOOKMARK_CATEGORIES } from "../src/lib/bookmark-categories.ts";

const first = BOOKMARK_CATEGORIES[0];
const alternate = BOOKMARK_CATEGORIES.find(category => category.section !== first.section);
const id = stem => first.section + "/" + stem;

test("current-category neighbors use newest-first dates and deterministic title/ID ties", () => {
  const source = [
    {id:id("beta"), title:"Beta", date:"2025-01-01"},
    {id:id("unknown"), title:"Without date", date:""},
    {id:id("newest"), title:"Newest", date:"2026-01-01"},
    {id:id("alpha"), title:"Alpha", date:"2025-01-01"},
    {id:id("zeta"), title:"Last dated", date:"2024-12-30"},
  ];
  if (alternate) source.splice(2, 0, {
    id:alternate.section + "/other", title:"Unrelated category", date:"2028-01-01",
  });
  const before = source.map(item => item.id);
  const neighbors = bookmarkNeighborMap(source);
  assert.equal(neighbors.get(id("newest"))?.previous, undefined);
  assert.equal(neighbors.get(id("newest"))?.next?.id, id("alpha"));
  assert.equal(neighbors.get(id("alpha"))?.previous?.id, id("newest"));
  assert.equal(neighbors.get(id("alpha"))?.next?.id, id("beta"));
  assert.equal(neighbors.get(id("beta"))?.next?.id, id("zeta"));
  assert.equal(neighbors.get(id("zeta"))?.next?.id, id("unknown"));
  assert.equal(neighbors.get(id("unknown"))?.next, undefined);
  if (alternate) {
    assert.equal(neighbors.get(alternate.section + "/other")?.previous, undefined);
    assert.equal(neighbors.get(alternate.section + "/other")?.next, undefined);
  }
  assert.deepEqual(source.map(item => item.id), before, "Source order must remain unchanged");
});

test("malformed and duplicate identities fail before rendering adjacent navigation", () => {
  for (const bad of ["Unknown/x",id("x") + "/nested",first.section + "/","../escape"]) {
    assert.throws(() => bookmarkNeighborMap([{id:bad,title:"Unsafe",date:""}]), /Invalid bookmark ID/);
  }
  const duplicate = {id:id("same"),title:"Same",date:"2024-01-01"};
  assert.throws(() => bookmarkNeighborMap([duplicate,duplicate]), /Duplicate bookmark/);
});

test("moving or deleting a bookmark recalculates neighbors from the current collection", () => {
  const make = (stem, date) => ({ id: id(stem), title: stem, date });
  const previous = [make("one", "2026-01-01"), make("two", "2025-01-01")];
  const initial = bookmarkNeighborMap(previous);
  assert.equal(initial.get(id("one"))?.next?.id, id("two"));

  // Deleting an entry must not require a historical source ID to remain.
  const reduced = bookmarkNeighborMap([previous[0]]);
  assert.equal(reduced.get(id("one"))?.previous, undefined);
  assert.equal(reduced.get(id("one"))?.next, undefined);
  assert.equal(reduced.has(id("two")), false);

  // New entries are placed in the latest sorted category-local sequence.
  const growing = bookmarkNeighborMap([...previous, make("three", "2027-01-01")]);
  assert.equal(growing.get(id("three"))?.next?.id, id("one"));
  assert.equal(growing.get(id("one"))?.previous?.id, id("three"));

  // Moving a published record between configured categories recalculates both
  // sequences instead of preserving stale pointers to its old path.
  if (alternate) {
    const destinationId = alternate.section + "/two";
    const moved = [
      previous[0],
      {...previous[1], id: destinationId},
      {id:alternate.section + "/existing",title:"Existing",date:"2024-01-01"},
    ];
    const afterMove = bookmarkNeighborMap(moved);
    assert.equal(afterMove.get(id("one"))?.previous, undefined);
    assert.equal(afterMove.get(id("one"))?.next, undefined);
    assert.equal(afterMove.has(id("two")), false);
    assert.equal(afterMove.get(destinationId)?.next?.id, alternate.section + "/existing");
    assert.equal(afterMove.get(alternate.section + "/existing")?.previous?.id, destinationId);
  }

  // An entirely empty category requires no navigation or preserved baseline.
  assert.equal(bookmarkNeighborMap([]).size, 0);
});
