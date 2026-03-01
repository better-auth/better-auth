import {
	defineCollections,
	defineConfig,
	defineDocs,
} from "fumadocs-mdx/config";
import * as z from "zod";

export const docs = defineDocs({
	dir: "./content/docs",
});

export const canaryDocs = defineDocs({
	dir: "./content/docs-canary",
});

export const blogCollection = defineCollections({
	type: "doc",
	dir: "./content/blogs",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.date(),
		draft: z.boolean().optional(),
		author: z
			.object({
				name: z.string(),
				avatar: z.string(),
				twitter: z.string().optional(),
			})
			.optional(),
		image: z.string().optional(),
		tags: z.array(z.string()).optional(),
	}),
});

export default defineConfig({});
