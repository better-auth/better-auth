import {
	defineCollections,
	defineDocs,
	getDefaultMDXOptions,
} from "fumadocs-mdx/config";
import { defineConfig } from "fumadocs-mdx/config";
import { remarkInstall } from "fumadocs-docgen";
import { z } from "zod";

export default defineConfig({
	mdxOptions: {
		remarkPlugins: [
			[
				remarkInstall,
				{
					persist: {
						id: "persist-install",
					},
				},
			],
		],
	},
});

export const changelog = defineCollections({
	type: "doc",
	dir: "./content/changelog",
	schema: z.object({
		title: z.string(),
	}),
});

export const { docs, meta } = defineDocs({
	dir: "./content/docs",
});
