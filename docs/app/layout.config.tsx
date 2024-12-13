import { source } from "@/app/source";
import {
	DocsNavbarMobileBtn,
	DocsNavbarMobileTitle,
} from "@/components/nav-mobile";
import { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export const baseOptions: BaseLayoutProps = {
	nav: {
		component: (
			<div className="flex items-center justify-between py-4 px-2.5 md:hidden">
				<DocsNavbarMobileTitle />
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

export const docsOptions = {
	...baseOptions,
	tree: source.pageTree,
};
