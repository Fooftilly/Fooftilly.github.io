/** Pure CSV-to-public-ratings conversion. No network/API calls and no user data
 * published until the generated JSON is explicitly reviewed and committed.
 */
export type RatingsKind = "music" | "films";
export type RatingsSource = "rym" | "letterboxd";
export interface RatingEntry {
  id: string;
  title: string;
  rating: number; // Normalized 0.5–5 stars.
  artist?: string;
  year?: number;
  url?: string;
}
export interface RatingsCatalog {
  schema: 1;
  kind: RatingsKind;
  source: "Rate Your Music" | "Letterboxd";
  items: RatingEntry[];
}

const MAX_ROWS = 50000;
const MAX_CHARS = 15_000_000;
const MAX_FIELD = 100000;

export function parseCsv(text: string): string[][] {
  if (text.length > MAX_CHARS) throw new Error("CSV exceeds 15 MB safety limit");
  const csv = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let justClosed = false;
  const column = () => { row.push(field.trim()); field = ""; justClosed = false; };
  const line = () => {
    column();
    if (row.some(value => value.length > 0)) rows.push(row);
    if (rows.length > MAX_ROWS + 1) throw new Error("CSV exceeds 50,000 records");
    row = [];
  };
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char === '"') {
        if (csv[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; justClosed = true; }
      } else field += char;
    } else if (char === ",") column();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && csv[i + 1] === "\n") i++;
      line();
    } else if (char === '"') {
      if (field.length > 0 || justClosed) throw new Error("Malformed CSV quote at row " + (rows.length + 1));
      quoted = true;
    } else if (justClosed) {
      if (char !== " " && char !== "\t") throw new Error("Unexpected character after CSV quote at row " + (rows.length + 1));
    } else field += char;
    if (field.length > MAX_FIELD) throw new Error("CSV field exceeds 100000 characters");
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (field || row.length || justClosed) line();
  return rows;
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const get = (row: Map<string, string>, ...keys: string[]) =>
  keys.map(name => row.get(key(name)) ?? "").find(Boolean) ?? "";
const clampText = (value: string, label: string, max: number): string => {
  const clean = value.trim().normalize("NFC");
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) {
    throw new Error(label + " must be nonempty printable text (up to " + max + " characters)");
  }
  return clean;
};
const readYear = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const found = value.match(/(?:^|\D)((?:18|19|20|21)\d{2})(?:\D|$)/);
  if (!found) throw new Error("Invalid release year: " + value);
  return Number(found[1]);
};
const readLink = (value: string): string | undefined => {
  if (!value.trim()) return undefined;
  if (value.length > 2048) throw new Error("Source URL exceeds 2048 characters");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password ||
    !["rateyourmusic.com", "www.rateyourmusic.com", "letterboxd.com", "www.letterboxd.com", "boxd.it"].includes(url.hostname)) {
    throw new Error("Unsupported external URL; only HTTPS RYM/Letterboxd links are allowed");
  }
  return url.href;
};
function ratingValue(raw: string, source: RatingsSource): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (source === "rym") {
    // RYM's exported 0–10 integer values correspond to 0–5 in half stars.
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error("RYM rating must be an integer from 0 to 10");
    return n === 0 ? null : n / 2;
  }
  if (!Number.isFinite(n) || n < 0.5 || n > 5 || !Number.isInteger(n * 2)) {
    throw new Error("Letterboxd rating must be 0.5–5 in half-star steps");
  }
  return n;
}

export function validateRatingsCatalog(raw: unknown, kind: RatingsKind): RatingsCatalog {
  if (!raw || typeof raw !== "object") throw new Error("Missing ratings catalog");
  const obj = raw as Record<string, unknown>;
  if (obj.schema !== 1 || obj.kind !== kind ||
    !["Rate Your Music", "Letterboxd"].includes(String(obj.source)) ||
    !Array.isArray(obj.items)) throw new Error("Invalid ratings catalog schema or kind");
  const catalogFields = new Set(["schema", "kind", "source", "items"]);
  if (Object.keys(obj).some(field => !catalogFields.has(field))) {
    throw new Error("Unexpected public ratings catalog field; raw export metadata may not be published");
  }
  if (obj.items.length > MAX_ROWS) throw new Error("Too many published ratings");
  const seen = new Set<string>();
  const items = obj.items.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("Invalid rating item " + index);
    const value = item as Record<string, unknown>;
    const publicFields = new Set(["id", "title", "rating", "artist", "year", "url"]);
    if (Object.keys(value).some(field => !publicFields.has(field))) {
      throw new Error("Unexpected public rating field at item " + index + "; private reviews/ownership must not be published");
    }
    const id = clampText(String(value.id ?? ""), "Rating identifier", 800);
    if (seen.has(id)) throw new Error("Duplicate rating identifier: " + id);
    seen.add(id);
    const title = clampText(String(value.title ?? ""), "Rating title", 300);
    const rating = Number(value.rating);
    if (!(rating >= 0.5 && rating <= 5 && Number.isInteger(rating * 2))) {
      throw new Error("Rating outside 0.5–5 stars: " + title);
    }
    const entry: RatingEntry = { id, title, rating };
    if (value.artist !== undefined) entry.artist = clampText(String(value.artist), "Artist or director", 250);
    if (value.year !== undefined) {
      if (!Number.isInteger(value.year) || Number(value.year) < 1800 || Number(value.year) > 2199) throw new Error("Invalid year: " + title);
      entry.year = Number(value.year);
    }
    if (value.url !== undefined) entry.url = readLink(String(value.url));
    return entry;
  });
  return { schema: 1, kind, source: obj.source as RatingsCatalog["source"], items };
}

export function parseRatingsCsv(text: string, kind: RatingsKind, source: RatingsSource = "rym"): RatingsCatalog {
  if (!["music", "films"].includes(kind)) throw new Error("Unsupported ratings kind");
  if (kind === "music" && source !== "rym") throw new Error("Music import requires an RYM catalog export");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("CSV requires a header and at least one data row");
  const keys = rows[0].map(key);
  if (keys.some(x => !x) || new Set(keys).size !== keys.length) throw new Error("Duplicate or empty CSV header");
  const required = (col: string) => { if (!keys.includes(key(col))) throw new Error("Missing required CSV column: " + col); };
  required("Rating");
  if (source === "rym") required("Title");
  else required("Name");
  if (kind === "music" && !keys.includes("lastname") && !keys.includes("artist")) {
    throw new Error("RYM music export is missing artist columns");
  }
  const items: RatingEntry[] = [];
  const ids = new Set<string>();
  for (let index = 1; index < rows.length; index++) {
    const cells = rows[index];
    if (cells.length !== keys.length) throw new Error("CSV row " + (index + 1) + " has " + cells.length + " columns, expected " + keys.length);
    const row = new Map(keys.map((name, i) => [name, cells[i]]));
    let stars: number | null;
    try { stars = ratingValue(get(row, "Rating"), source); }
    catch (error) { throw new Error("CSV row " + (index + 1) + ": " + (error as Error).message); }
    if (stars === null) continue; // Omit wishlists, unrated entries and blanks.
    try {
      const title = clampText(get(row, source === "rym" ? "Title" : "Name"), "Title", 300);
      const year = readYear(get(row, source === "rym" ? "Release_Date" : "Year", "Year"));
      const artist = kind === "music"
        ? clampText(get(row, "Artist") || [
            get(row, "First Name") || get(row, "First Name localized"),
            get(row, "Last Name") || get(row, "Last Name localized"),
          ].filter(Boolean).join(" "), "Artist", 250)
        : get(row, "Director");
      const nativeId = get(row, "RYM Album", "RYM Film", "Letterboxd URI");
      const id = nativeId || [kind, title, artist, year ?? ""].join("|").toLowerCase();
      if (ids.has(id)) throw new Error("Duplicate rated item " + id);
      ids.add(id);
      const entry: RatingEntry = { id, title, rating: stars };
      if (artist) entry.artist = clampText(artist, "Artist/director", 250);
      if (year !== undefined) entry.year = year;
      const link = readLink(get(row, "Letterboxd URI", "RYM URL", "URL"));
      if (link) entry.url = link;
      items.push(entry);
    } catch (error) {
      throw new Error("CSV row " + (index + 1) + ": " + (error as Error).message);
    }
  }
  if (!items.length) throw new Error("The CSV contains no rated items; existing published data was not changed");
  items.sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  return validateRatingsCatalog({
    schema: 1, kind, source: source === "rym" ? "Rate Your Music" : "Letterboxd", items,
  }, kind);
}
