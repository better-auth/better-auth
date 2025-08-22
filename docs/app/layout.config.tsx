import { changelogs, source } from "@/lib/source";
import type { BaseLayoutProps } from "@/components/docs/shared";

export const baseOptions: BaseLayoutProps = {
	nav: {
		enabled: false,
	},
	links: [
		{
			text: "Documentation",
			url: "/docs",
			active: "nested-url",
		},
	],
};

export const docsOptions = {
	...baseOptions,
	tree: source.pageTree,
};
export const changelogOptions = {
	...baseOptions,
	tree: changelogs.pageTree,
};
