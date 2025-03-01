import { changelogCollection, docs } from "@/.source";
import { createMDXSource } from "fumadocs-mdx";
import { loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});
export const changelogs = loader({
	baseUrl: "/changelogs",
	source: createMDXSource(changelogCollection),
});
