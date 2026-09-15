"use client";

import type { TOCItemType } from "fumadocs-core/toc";
import { TOC, TOCProvider } from "fumadocs-ui/layouts/glass/page/slots/toc";

interface BlogTOCProps {
	items: TOCItemType[];
}

export function BlogTOC({ items }: BlogTOCProps) {
	const topLevelItems = items.filter((item) => item.depth <= 2);
	if (topLevelItems.length === 0) return null;

	return (
		<TOCProvider toc={topLevelItems}>
			<TOC container={{ className: "blog-toc" }} />
		</TOCProvider>
	);
}
