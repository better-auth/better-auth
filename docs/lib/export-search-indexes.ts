import { findPath } from "fumadocs-core/page-tree";
import type { DocumentRecord } from "typesense-fumadocs-adapter";
import { source } from "@/lib/source";

export async function exportSearchIndexes() {
	const results: DocumentRecord[] = [];

	function isBreadcrumbItem(item: unknown): item is string {
		return typeof item === "string" && item.length > 0;
	}

	for (const page of source.getPages()) {
		let breadcrumbs: string[] | undefined;
		const pageTree = source.getPageTree(page.locale);
		const path = findPath(
			pageTree.children,
			(node) => node.type === "page" && node.url === page.url,
		);

		if (path) {
			breadcrumbs = [];
			path.pop();
			if (isBreadcrumbItem(pageTree.name)) {
				breadcrumbs.push(pageTree.name);
			}
			for (const segment of path) {
				if (!isBreadcrumbItem(segment.name)) continue;
				breadcrumbs.push(segment.name);
			}
		}

		const loaded = await page.data.load();

		results.push({
			_id: page.url,
			structured: loaded.structuredData,
			url: page.url,
			title: page.data.title,
			description: page.data.description,
			breadcrumbs,
		});
	}

	return results;
}
