// The admin and public site read the same Git-managed Markdown collections.
// The admin-only build uses a different Astro srcDir/output directory.
export { collections } from "../src/content.config.ts";
