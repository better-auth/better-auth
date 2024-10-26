import { docs, meta, changelog as _changelog } from "@/.source";
import { createMDXSource } from "fumadocs-mdx";
import { loader } from "fumadocs-core/source";

export const source = loader({
	baseUrl: "/docs",
	source: createMDXSource(docs, meta),
});

export const changelog = loader({
	baseUrl: "/changelog",
	source: createMDXSource(_changelog, meta),
});
