// @ts-check
import { defineConfig } from "astro/config";

import tailwind from "@astrojs/tailwind";

import solidJs from "@astrojs/solid-js";

// https://astro.build/config
export default defineConfig({
	output: "server",
	integrations: [
		tailwind({
			applyBaseStyles: false,
		}),
		solidJs(),
	],
});
