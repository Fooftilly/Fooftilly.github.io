/** Choose a free disc/season-relative position after removals or renumbering.
 * This is draft UI behavior; canonical uniqueness is still enforced by the model.
 */
export function nextAvailableMediaPosition(values: readonly (string | number)[], maximum: number): number {
  const used = new Set(values.map(Number).filter(value =>
    Number.isInteger(value) && value >= 1 && value <= maximum));
  for (let position = 1; position <= maximum; position++) {
    if (!used.has(position)) return position;
  }
  throw new Error("No available media position");
}
