import {
	defineDocs,
	defineConfig,
	defineCollections,
} from "fumadocs-mdx/config";
import { z } from "zod";
import { remarkInstall } from "fumadocs-docgen";

export const docs = defineDocs({
	dir: "./content/docs",
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

export const blogCollection = defineCollections({
	type: "doc",
	dir: "./content/blogs",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.date(),
		author: z.object({
			name: z.string(),
			avatar: z.string(),
			twitter: z.string(),
		}),
		image: z.string(),
		tags: z.array(z.string()),
	}),
});

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
