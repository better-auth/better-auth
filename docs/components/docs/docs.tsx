import type { PageTree } from "fumadocs-core/server";
import { type ReactNode, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { replaceOrDefault } from "./shared";
import { type BaseLayoutProps } from "./shared";
import { Navbar, NavbarSidebarTrigger } from "./docs.client";
import { TreeContextProvider } from "fumadocs-ui/provider";
import { NavProvider, Title } from "./layout/nav";
import { SearchToggle } from "./layout/search-toggle";
import { layoutVariables } from "./docs/shared";
import { type PageStyles, StylesProvider } from "fumadocs-ui/provider";
import ArticleLayout from "../side-bar";

export interface DocsLayoutProps extends BaseLayoutProps {
	tree: PageTree.Root;

	containerProps?: HTMLAttributes<HTMLDivElement>;
}

export function DocsLayout({
	nav: {
		enabled: navEnabled = true,
		component: navReplace,
		transparentMode,
		...nav
	} = {},
	children,
	...props
}: DocsLayoutProps): ReactNode {
	const variables = cn(
		"[--fd-tocnav-height:36px] md:[--fd-sidebar-width:268px] lg:[--fd-sidebar-width:286px] xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px]",
		!navReplace && navEnabled
			? "[--fd-nav-height:calc(var(--spacing)*14)] md:[--fd-nav-height:0px]"
			: undefined,
	);

	const pageStyles: PageStyles = {
		tocNav: cn("xl:hidden"),
		toc: cn("max-xl:hidden"),
	};

	return (
		<TreeContextProvider tree={props.tree}>
			<NavProvider transparentMode={transparentMode}>
				{replaceOrDefault(
					{ enabled: navEnabled, component: navReplace },
					<Navbar className="md:hidden">
						<Title url={nav.url} title={nav.title} />
						<div className="flex flex-1 flex-row items-center gap-1">
							{nav.children}
						</div>
						<SearchToggle hideIfDisabled />
						<NavbarSidebarTrigger className="-me-2 md:hidden" />
					</Navbar>,
					nav,
				)}
				<main
					id="nd-docs-layout"
					{...props.containerProps}
					className={cn(
						"flex flex-1 flex-row pe-(--fd-layout-offset)",
						variables,
						props.containerProps?.className,
					)}
					style={{
						...layoutVariables,
						...props.containerProps?.style,
					}}
				>
					<div
						className={cn(
							"[--fd-tocnav-height:36px] md:mr-[268px] lg:mr-[286px] xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px] ",
						)}
					>
						<ArticleLayout />
					</div>
					<StylesProvider {...pageStyles}>{children}</StylesProvider>
				</main>
			</NavProvider>
		</TreeContextProvider>
	);
}
