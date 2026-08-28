import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blogCollection, docs, docsV16 } from "@/.source/server";
import type { DocsVersionId } from "./docs-versions";
import { pageTreePlugin } from "./page-tree";

const docsPlugins = [pageTreePlugin(), lucideIconsPlugin()];

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
	pageTree: { noRef: true },
	plugins: docsPlugins,
});

export const sourceV16 = loader({
	baseUrl: "/docs/1.6",
	source: docsV16.toFumadocsSource(),
	pageTree: { noRef: true },
	plugins: docsPlugins,
});

const docsSources = {
	latest: source,
	"1.6": sourceV16,
} satisfies Record<DocsVersionId, typeof source>;

export function getSourceFor(versionId: DocsVersionId) {
	return docsSources[versionId];
}

export const blogs = loader({
	baseUrl: "/blog",
	source: toFumadocsSource(blogCollection, []),
});
