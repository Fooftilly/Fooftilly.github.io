import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";

// Separate output from the public website. Deployment is disabled until the
// administrator configures a mandatory Cloudflare Access policy on the host
// AND closes alternate/origin hostnames to unauthenticated requests.
export default defineConfig({
  site: "https://admin.peroniko.xyz",
  output: "static",
  srcDir: "./admin-src",
  outDir: "./admin-dist",
  publicDir: "./admin-public",
  integrations: [vue()],
});
