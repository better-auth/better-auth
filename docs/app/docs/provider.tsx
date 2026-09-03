"use client";

import type { Node, Root } from "fumadocs-core/page-tree";
import { RootProvider } from "fumadocs-ui/provider/next";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { createContext, use, useMemo } from "react";
import type {
	DocsVersionId,
	ResolvedDocsVersion,
	VersionAvailability,
} from "@/lib/docs-versions";
import { getVersionFromPathname } from "@/lib/docs-versions";

const SearchDialog = dynamic(() => import("@/components/search-dialog"), {
	ssr: false,
});

export interface PageEntry {
	name: string;
	url: string;
}

export type PageTreesByVersion = Record<DocsVersionId, Root>;

interface DocsNavigation {
	pageTreesByVersion: PageTreesByVersion;
	versions: ResolvedDocsVersion[];
	versionAvailability: VersionAvailability;
}

const DocsNavigationContext = createContext<DocsNavigation | null>(null);

function useDocsNavigation() {
	const navigation = use(DocsNavigationContext);
	if (!navigation) {
		throw new Error("Docs navigation must be used inside DocsProvider");
	}
	return navigation;
}

export function usePageTree() {
	const pathname = usePathname() || "/docs";
	const { pageTreesByVersion } = useDocsNavigation();
	const version = getVersionFromPathname(pathname);
	return pageTreesByVersion[version.id];
}

export function useVersionAvailability() {
	return useDocsNavigation().versionAvailability;
}

export function useDocsVersions() {
	return useDocsNavigation().versions;
}

function getNodeLabel(node: Extract<Node, { type: "page" }>): string {
	if (typeof node.name === "string") return node.name;
	return node.url.split("/").filter(Boolean).at(-1) ?? "Documentation";
}

function collectPages(
	nodes: Node[],
	pages: PageEntry[],
	seenUrls: Set<string>,
) {
	for (const node of nodes) {
		if (node.type === "separator") continue;
		if (node.type === "folder") {
			if (node.index) collectPages([node.index], pages, seenUrls);
			collectPages(node.children, pages, seenUrls);
			continue;
		}
		if (node.external || seenUrls.has(node.url)) continue;
		seenUrls.add(node.url);
		pages.push({ name: getNodeLabel(node), url: node.url });
	}
}

export function usePages() {
	const pageTree = usePageTree();
	return useMemo(() => {
		const pages: PageEntry[] = [];
		collectPages(pageTree.children, pages, new Set());
		return pages;
	}, [pageTree]);
}

export function DocsProvider({
	pageTreesByVersion,
	versions,
	versionAvailability,
	children,
}: {
	pageTreesByVersion: PageTreesByVersion;
	versions: ResolvedDocsVersion[];
	versionAvailability: VersionAvailability;
	children: ReactNode;
}) {
	const navigation = useMemo(
		() => ({ pageTreesByVersion, versions, versionAvailability }),
		[pageTreesByVersion, versions, versionAvailability],
	);

	return (
		<DocsNavigationContext value={navigation}>
			<RootProvider search={{ SearchDialog }} theme={{ enabled: false }}>
				{children}
			</RootProvider>
		</DocsNavigationContext>
	);
}
