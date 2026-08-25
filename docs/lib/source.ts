import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blogCollection, docs, docsBeta, docsV16 } from "@/.source/server";
import { pageTreeIconsPlugin } from "./page-tree-icons";

const iconPlugins = [pageTreeIconsPlugin(), lucideIconsPlugin()];

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
	pageTree: { noRef: true },
	plugins: iconPlugins,
});

export const sourceBeta = loader({
	baseUrl: "/docs/beta",
	source: docsBeta.toFumadocsSource(),
	pageTree: { noRef: true },
	plugins: iconPlugins,
});

export const sourceV16 = loader({
	baseUrl: "/docs/1.6",
	source: docsV16.toFumadocsSource(),
	pageTree: { noRef: true },
	plugins: iconPlugins,
});

/**
 * Pick the docs source loader for a given version slug.
 */
export function getSourceFor(versionId: string) {
	switch (versionId) {
		case "beta":
			return sourceBeta;
		case "1.6":
			return sourceV16;
		default:
			return source;
	}
}

export const blogs = loader({
	baseUrl: "/blog",
	source: toFumadocsSource(blogCollection, []),
});
