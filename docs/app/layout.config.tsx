import type { DocsLayoutProps } from "fumadocs-ui/layout";
import type { HomeLayoutProps } from "fumadocs-ui/home-layout";
import { pageTree } from "@/app/source";
import { DocsNavbarMobileBtn } from "@/components/nav-mobile";

// shared configuration
export const baseOptions: HomeLayoutProps = {
	nav: {
		component: (
			<div className="flex items-center justify-between py-4 px-2.5 md:hidden">
				<p className="">Docs</p>
				<DocsNavbarMobileBtn />
			</div>
		),
	},
	links: [
		{
			text: "Documentation",
			url: "/docs",
			active: "nested-url",
		},
	],
};

// docs layout configuration
export const docsOptions: DocsLayoutProps = {
	...baseOptions,
	tree: pageTree,
};
