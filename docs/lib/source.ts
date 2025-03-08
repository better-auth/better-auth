import { changelogCollection, docs } from "@/.source";
import { loader } from "fumadocs-core/source";
import { createMDXSource } from "fumadocs-mdx";

export const source = loader({
	baseUrl: "/docs",
	source: docs.toFumadocsSource(),
});

export const changelogs = loader({
	baseUrl: "/changelogs",
	source: createMDXSource(changelogCollection),
});
