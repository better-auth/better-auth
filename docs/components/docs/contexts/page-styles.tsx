"use client";

import { createContext, useContext } from "react";

export type PageStyles = {
	tocNav?: string;
	toc?: string;
	page?: string;
	article?: string;
};

const PageStylesContext = createContext<PageStyles>({});

export function PageStylesProvider({
	children,
	...styles
}: PageStyles & { children: React.ReactNode }) {
	return (
		<PageStylesContext.Provider value={styles}>
			{children}
		</PageStylesContext.Provider>
	);
}

export function usePageStyles(): PageStyles {
	return useContext(PageStylesContext);
}
