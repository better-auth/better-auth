import { changelogCollection, docs, blogCollection } from "@/.source";
import { getPageTree } from "@/components/sidebar-content";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

export let source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

source = { ...source, pageTree: getPageTree() };

export const changelogs = loader({
	baseUrl: "/changelogs",
	source: createMDXSource(changelogCollection),
});

export const blogs = loader({
	baseUrl: "/blogs",
	source: createMDXSource(blogCollection),
});
