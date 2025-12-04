import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blogCollection, changelogCollection, docs } from "@/.source/server";
import { getPageTree } from "@/components/sidebar-content";

export let source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

source = { ...source, pageTree: getPageTree() };

export const changelogs = loader(toFumadocsSource(changelogCollection, []), {
	baseUrl: "/changelogs",
});

export const blogs = loader(toFumadocsSource(blogCollection, []), {
	baseUrl: "/blog",
});
