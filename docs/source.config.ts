import { defineCollections, defineDocs } from "fumadocs-mdx/config";
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

export const changelogCollection = defineCollections({
	type: "doc",
	dir: "./content/changelogs",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.date(),
	}),
});

export const { docs, meta } = defineDocs({
	dir: "./content/docs",
});
