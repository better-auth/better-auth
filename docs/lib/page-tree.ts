import type { Node } from "fumadocs-core/page-tree";
import type { LoaderPlugin } from "fumadocs-core/source";
import { createElement } from "react";
import * as z from "zod";
import type { IconKey } from "../components/icons";
import { Icons } from "../components/icons";

const sidebarMetadataSchema = z.object({
	sidebarBadge: z.string().optional().catch(undefined),
	sidebarTitle: z.string().optional().catch(undefined),
});

export type SidebarPageMetadata = z.infer<typeof sidebarMetadataSchema>;

export type SidebarPageNode = Extract<Node, { type: "page" }> &
	SidebarPageMetadata;

function hasIcon(key: string): key is IconKey {
	return Object.hasOwn(Icons, key);
}

function renderIcon(key: string | undefined) {
	if (!key || !hasIcon(key)) return;
	return createElement(Icons[key]);
}

function resolveNodeIcon(icon: Node["icon"]) {
	const result = z.string().safeParse(icon);
	return result.success ? renderIcon(result.data) : undefined;
}

export function isPathWithinFolderIndex(
	indexUrl: string | undefined,
	pathname: string,
) {
	return (
		indexUrl === pathname ||
		(indexUrl !== undefined && pathname.startsWith(`${indexUrl}/`))
	);
}

export function pageTreePlugin(): LoaderPlugin {
	return {
		name: "better-auth:page-tree",
		transformPageTree: {
			file(node, file) {
				const sourceFile = file ? this.storage.read(file) : undefined;
				const metadata = sidebarMetadataSchema.safeParse(sourceFile?.data);
				if (metadata.success) Object.assign(node, metadata.data);
				node.icon = resolveNodeIcon(node.icon) ?? node.icon;
				return node;
			},
			folder(node) {
				node.icon = resolveNodeIcon(node.icon) ?? node.icon;
				return node;
			},
			separator(node) {
				node.icon = resolveNodeIcon(node.icon) ?? node.icon;
				return node;
			},
		},
	};
}
