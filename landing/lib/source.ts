import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blogCollection, canaryDocs, docs } from "@/.source/server";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export const canarySource = loader({
	baseUrl: "/docs",
	source: canaryDocs.toFumadocsSource(),
});

export function getSource(branch?: string) {
	return branch === "canary" ? canarySource : source;
}

export const blogs = loader({
	baseUrl: "/blog",
	source: toFumadocsSource(blogCollection, []),
});
