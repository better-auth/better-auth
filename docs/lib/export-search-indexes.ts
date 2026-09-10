import { findPath } from "fumadocs-core/page-tree";
import type { DocumentRecord } from "typesense-fumadocs-adapter";
import { docsVersions } from "@/lib/docs-versions";
import { getSourceFor } from "@/lib/source";

export async function exportSearchIndexes() {
	function isBreadcrumbItem(item: unknown): item is string {
		return typeof item === "string" && item.length > 0;
	}

	const records = docsVersions.flatMap((version) => {
		const source = getSourceFor(version.id);
		const pageTree = source.getPageTree();

		return source
			.getPages()
			.filter((page) => page.slugs[0] !== "examples")
			.map(async (page): Promise<DocumentRecord> => {
				let breadcrumbs: string[] | undefined;
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

				return {
					_id: page.url,
					structured: loaded.structuredData,
					url: page.url,
					title: page.data.title,
					description: page.data.description,
					breadcrumbs,
					tag: version.id,
				};
			});
	});

	return Promise.all(records);
}
