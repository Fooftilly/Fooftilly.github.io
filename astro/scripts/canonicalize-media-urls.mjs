/** Canonicalize media source URLs with the same WHATWG semantics as Astro. */
import { readFileSync } from "node:fs";

const values = JSON.parse(readFileSync(0, "utf8"));
if (!Array.isArray(values)) throw new Error("Expected URL array");

const canonical = values.map((value) => {
  if (typeof value !== "string") throw new Error("Invalid media URL");
  const url = new URL(value.trim().normalize("NFC"));
  if (!["http:", "https:"].includes(url.protocol) ||
      !url.hostname || url.username || url.password) {
    throw new Error("Invalid public media URL");
  }
  return url.href;
});
process.stdout.write(JSON.stringify(canonical));
