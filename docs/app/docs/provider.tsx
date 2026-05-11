"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { createContext, use } from "react";

const SearchDialog = dynamic(() => import("@/components/search-dialog"), {
	ssr: false,
});

export interface PageEntry {
	name: string;
	url: string;
}

export const PagesContext = createContext<PageEntry[]>([]);

export function usePages() {
	return use(PagesContext);
}

export function DocsProvider({
	pages,
	children,
}: {
	pages: PageEntry[];
	children: ReactNode;
}) {
	return (
		<PagesContext value={pages}>
			<RootProvider
				search={{
					SearchDialog,
				}}
			>
				{children}
			</RootProvider>
		</PagesContext>
	);
}
