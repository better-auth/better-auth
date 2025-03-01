import { changelogs, docs } from "@/.source";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export const changelogsSource = loader({
	baseUrl: "/changelogs",
	source: createMDXSource(changelogs),
});
