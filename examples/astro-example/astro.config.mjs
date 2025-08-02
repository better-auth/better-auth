// @ts-check
import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import solidJs from "@astrojs/solid-js";
// adjust server adapter as needed
// https://docs.astro.build/en/guides/integrations-guide/
import node from "@astrojs/node";

export default defineConfig({
  output: "server",
  integrations: [
      tailwind({
          applyBaseStyles: false,
      }),
      solidJs(),
	],
  adapter: node({
    mode: "standalone",
  }),
});
