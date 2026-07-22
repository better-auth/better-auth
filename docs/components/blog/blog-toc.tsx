"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import { TOC, TOCProvider } from "fumadocs-ui/layouts/glass/page/slots/toc";

interface BlogTOCProps {
	items: TOCItemType[];
}

export function BlogTOC({ items }: BlogTOCProps) {
	return (
		<TOCProvider toc={items}>
			<TOC />
		</TOCProvider>
	);
}
