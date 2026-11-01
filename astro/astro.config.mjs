import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import { satteri } from "@astrojs/markdown-satteri";
import { satteriLegacyCloakEmail } from "./src/markdown/legacy-cloakemail.mjs";

// Staging-only build; publication is deliberately disabled until #11 acceptance.
export default defineConfig({
  site: "https://www.peroniko.xyz",
  // Preserve the authoritative Hugo static files (CNAME, robots, favicons,
  // verification tokens and web manifest) without copying or rewriting them.
  publicDir: "../static",
  output: "static",
  integrations: [vue()],
  markdown: { processor: satteri({ mdastPlugins: [satteriLegacyCloakEmail()] }) },
});
