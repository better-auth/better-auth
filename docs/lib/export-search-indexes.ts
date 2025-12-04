import type { OramaDocument } from "fumadocs-core/search/orama-cloud";
import { source } from "@/lib/source";

export async function exportSearchIndexes() {
	return source.getPages().map((page) => {
		return {
			id: page.url,
			structured: page.data.structuredData,
			url: page.url,
			title: page.data.title,
			description: page.data.description,
		} satisfies OramaDocument;
	});
}
