import { source } from "@/lib/source";

type SearchIndexRecord = {
	id: string;
	structured: unknown;
	url: string;
	title: string;
	description: string | undefined;
};

export async function exportSearchIndexes() {
	return source.getPages().map((page) => {
		return {
			id: page.url,
			structured: page.data.structuredData,
			url: page.url,
			title: page.data.title,
			description: page.data.description,
		} satisfies SearchIndexRecord;
	});
}
