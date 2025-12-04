import { remarkNpm } from "fumadocs-core/mdx-plugins";
import {
	defineCollections,
	defineConfig,
	defineDocs,
} from "fumadocs-mdx/config";
import { createGenerator, remarkAutoTypeTable } from "fumadocs-typescript";
import * as z from "zod";

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
			twitter: z.string().optional(),
		}),
		image: z.string(),
		tags: z.array(z.string()),
	}),
});

const generator = createGenerator();

export default defineConfig({
	mdxOptions: {
		remarkPlugins: [
			[
				remarkNpm,
				{
					persist: {
						id: "persist-install",
					},
				},
			],
			[remarkAutoTypeTable, { generator }],
		],
	},
});
