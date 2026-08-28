"use client";

import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { usePageTree } from "@/app/docs/provider";

export function VersionedDocsLayout({ children }: { children: ReactNode }) {
	const tree = usePageTree();

	return (
		<DocsLayout
			tree={tree}
			nav={{ enabled: false }}
			searchToggle={{ enabled: false }}
			themeSwitch={{ enabled: false }}
			sidebar={{ enabled: false }}
			containerProps={{
				className: "docs-layout",
			}}
		>
			{children}
		</DocsLayout>
	);
}
