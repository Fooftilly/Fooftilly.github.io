import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";

// Staging-only build; publication is deliberately disabled until #11 acceptance.
export default defineConfig({
  site: "https://www.peroniko.xyz",
  output: "static",
  integrations: [vue()],
});
