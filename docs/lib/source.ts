import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blogCollection, docs, docsBeta } from "@/.source/server";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export const sourceBeta = loader({
	baseUrl: "/docs/beta",
	source: docsBeta.toFumadocsSource(),
});

/**
 * Pick the docs source loader for a given version slug.
 */
export function getSourceFor(versionSlug: string | null) {
	switch (versionSlug) {
		case "beta":
			return sourceBeta;
		default:
			return source;
	}
}

export const blogs = loader({
	baseUrl: "/blog",
	source: toFumadocsSource(blogCollection, []),
});
