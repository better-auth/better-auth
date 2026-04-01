import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";
import { blogCollection, docs } from "@/.source/server";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export const blogs = loader({
	baseUrl: "/blog",
	source: toFumadocsSource(blogCollection, []),
});
