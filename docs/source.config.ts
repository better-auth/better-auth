import type { LLMsOptions } from "fumadocs-core/mdx-plugins/remark-llms";
import { pageSchema } from "fumadocs-core/source/schema";
import {
	defineCollections,
	defineConfig,
	defineDocs,
} from "fumadocs-mdx/config";
import lastModified from "fumadocs-mdx/plugins/last-modified";
import {
	createFileSystemGeneratorCache,
	createGenerator,
	remarkAutoTypeTable,
} from "fumadocs-typescript";
import * as z from "zod";

const docsPageSchema = pageSchema.extend({
	sidebarBadge: z.string().min(1).optional(),
	sidebarTitle: z.string().min(1).optional(),
});

const processedMarkdownOptions = {
	mdxAsPlaceholder: ["APIMethod"],
} satisfies LLMsOptions;

export const docs = defineDocs({
	dir: "./content/docs",
	docs: {
		schema: docsPageSchema,
		postprocess: {
			includeProcessedMarkdown: processedMarkdownOptions,
		},
		async: true,
	},
});

export const docsV16 = defineDocs({
	dir: "./content/_generated/docs/v1-6",
	docs: {
		schema: docsPageSchema,
		postprocess: {
			includeProcessedMarkdown: processedMarkdownOptions,
		},
		async: true,
	},
});

export const blogCollection = defineCollections({
	type: "doc",
	dir: "./content/blogs",
	schema: z.object({
		title: z.string(),
		description: z.string(),
		date: z.coerce.date(),
		draft: z.boolean().optional(),
		author: z
			.object({
				name: z.string(),
				avatar: z.string(),
				twitter: z.string().optional(),
			})
			.optional(),
		image: z
			.union([
				z.string(),
				z.object({
					light: z.string(),
					dark: z.string(),
				}),
			])
			.optional(),
		tags: z.array(z.string()).optional(),
	}),
	postprocess: {
		includeProcessedMarkdown: true,
	},
});

const generator = createGenerator({
	cache: createFileSystemGeneratorCache(".next/fumadocs-typescript"),
});

export default defineConfig({
	mdxOptions: {
		remarkNpmOptions: {
			persist: {
				id: "persist-install",
			},
		},
		remarkPlugins: [[remarkAutoTypeTable, { generator }]],
	},
	plugins: [lastModified()],
});
