import type { PageTree } from "fumadocs-core/server";
import type { PageStyles } from "fumadocs-ui/provider";
import { StylesProvider, TreeContextProvider } from "fumadocs-ui/provider";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";
import ArticleLayout from "../side-bar";
import { NavProvider } from "./layout/nav";
import type { BaseLayoutProps } from "./shared";

export interface DocsLayoutProps extends BaseLayoutProps {
	tree: PageTree.Root;

	containerProps?: HTMLAttributes<HTMLDivElement>;
}

export function DocsLayout({ children, ...props }: DocsLayoutProps): ReactNode {
	const variables = cn(
		"[--fd-tocnav-height:36px] md:[--fd-sidebar-width:268px] lg:[--fd-sidebar-width:286px] xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px]",
	);

	const pageStyles: PageStyles = {
		tocNav: cn("xl:hidden"),
		toc: cn("max-xl:hidden"),
	};

	return (
		<TreeContextProvider tree={props.tree}>
			<NavProvider>
				<main
					id="nd-docs-layout"
					{...props.containerProps}
					className={cn(
						"flex flex-1 flex-row pe-(--fd-layout-offset)",
						variables,
						props.containerProps?.className,
					)}
					style={
						{
							"--fd-layout-offset":
								"max(calc(50vw - var(--fd-layout-width) / 2), 0px)",
							...props.containerProps?.style,
						} as object
					}
				>
					<div
						className={cn(
							"[--fd-tocnav-height:36px] navbar:mr-[268px] lg:mr-[286px]! xl:[--fd-toc-width:286px] xl:[--fd-tocnav-height:0px] ",
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
