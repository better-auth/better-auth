import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";
import { blogCollection, changelogCollection, docs } from "@/.source";
import { getPageTree } from "@/components/sidebar-content";

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
