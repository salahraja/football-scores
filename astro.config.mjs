import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";

// Each page is built to plain HTML. The homepage's board is a Vue island (client:load): its first screen arrives as HTML and
// Vue takes it over when it loads; League Table and Match Results ship no script at all. public/ (fonts, the API and the
// league pages that npm run api writes) is copied into dist as it is.
export default defineConfig({
  integrations: [vue()],
  outDir: "dist",
  // VITE_DATA picks the data the pages are built from (see src/data/index.ts); the island needs to see the same value
  vite: { envPrefix: ["VITE_", "PUBLIC_"] },
});
