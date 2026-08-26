import type { Node } from "fumadocs-core/page-tree";
import type { LoaderPlugin } from "fumadocs-core/source";
import { createElement } from "react";
import type { IconKey } from "../components/icons";
import { Icons } from "../components/icons";

export interface SidebarPageMetadata {
	sidebarBadge?: string;
	sidebarTitle?: string;
}

export type SidebarPageNode = Extract<Node, { type: "page" }> &
	SidebarPageMetadata;

function hasIcon(key: string): key is IconKey {
	return key in Icons;
}

function renderIcon(key: string | undefined) {
	if (!key || !hasIcon(key)) return;
	return createElement(Icons[key]);
}

function resolveNodeIcon(icon: unknown) {
	return typeof icon === "string" ? renderIcon(icon) : undefined;
}

export function getSidebarMetadata(data: unknown): SidebarPageMetadata {
	if (!data || typeof data !== "object" || Array.isArray(data)) return {};
	const values = data as Record<string, unknown>;
	return {
		sidebarBadge:
			typeof values.sidebarBadge === "string" ? values.sidebarBadge : undefined,
		sidebarTitle:
			typeof values.sidebarTitle === "string" ? values.sidebarTitle : undefined,
	};
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
				Object.assign(node, getSidebarMetadata(sourceFile?.data));
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
			root(node) {
				Object.assign(node, {
					icon: renderIcon("getStarted"),
				});
				return node;
			},
		},
	};
}
