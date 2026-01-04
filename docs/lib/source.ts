import {
	blogCollection,
	changelogCollection,
	docs,
} from "fumadocs-mdx:collections/server";
import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { getPageTree } from "@/components/sidebar-content";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

source.pageTree = getPageTree();

export const changelogs = loader({
	baseUrl: "/changelogs",
	source: toFumadocsSource(changelogCollection, []),
});

export const blogs = loader({
	baseUrl: "/blogs",
	source: toFumadocsSource(blogCollection, []),
});
