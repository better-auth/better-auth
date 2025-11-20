import type { TableOfContents } from "fumadocs-core/server";
import type { AnchorProviderProps } from "fumadocs-core/toc";
import { AnchorProvider } from "fumadocs-core/toc";
import { I18nLabel } from "fumadocs-ui/provider";
import { Edit, Text } from "lucide-react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";
import type { TOCProps } from "./layout/toc";
import {
	TOCItems,
	TOCScrollArea,
	Toc,
	TocPopoverContent,
	TocPopoverTrigger,
} from "./layout/toc";
import type { BreadcrumbProps, FooterProps } from "./page.client";
import {
	Footer,
	LastUpdate,
	PageArticle,
	PageBody,
	TocPopoverHeader,
} from "./page.client";
import { replaceOrDefault } from "./shared";
import { buttonVariants } from "./ui/button";

type TableOfContentOptions = Omit<TOCProps, "items" | "children"> &
	Pick<AnchorProviderProps, "single"> & {
		enabled: boolean;
		component: ReactNode;
	};

type TableOfContentPopoverOptions = Omit<TableOfContentOptions, "single">;

interface EditOnGitHubOptions
	extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> {
	owner: string;
	repo: string;

	/**
	 * Branch name.
	 *
	 * @defaultValue canary
	 */
	branch?: string;

	/**
	 * File path in the repo
	 */
	path: string;
}

interface BreadcrumbOptions extends BreadcrumbProps {
	enabled: boolean;
	component: ReactNode;

	/**
	 * Show the full path to the current page
	 *
	 * @defaultValue false
	 * @deprecated use `includePage` instead
	 */
	full?: boolean;
}

interface FooterOptions extends FooterProps {
	enabled: boolean;
	component: ReactNode;
}

export interface DocsPageProps {
	toc?: TableOfContents;

	/**
	 * Extend the page to fill all available space
	 *
	 * @defaultValue false
	 */
	full?: boolean;

	tableOfContent?: Partial<TableOfContentOptions>;
	tableOfContentPopover?: Partial<TableOfContentPopoverOptions>;

	/**
	 * Replace or disable breadcrumb
	 */
	breadcrumb?: Partial<BreadcrumbOptions>;

	/**
	 * Footer navigation, you can disable it by passing `false`
	 */
	footer?: Partial<FooterOptions>;

	editOnGithub?: EditOnGitHubOptions;
	lastUpdate?: Date | string | number;

	container?: HTMLAttributes<HTMLDivElement>;
	article?: HTMLAttributes<HTMLElement>;
	children: ReactNode;
}

export function DocsPage({
	toc = [],
	full = false,
	tableOfContentPopover: {
		enabled: tocPopoverEnabled,
		component: tocPopoverReplace,
		...tocPopoverOptions
	} = {},
	tableOfContent: {
		enabled: tocEnabled,
		component: tocReplace,
		...tocOptions
	} = {},
	...props
}: DocsPageProps) {
	const isTocRequired =
		toc.length > 0 ||
		tocOptions.footer !== undefined ||
		tocOptions.header !== undefined;

	// disable TOC on full mode, you can still enable it with `enabled` option.
	tocEnabled ??= !full && isTocRequired;

	tocPopoverEnabled ??=
		toc.length > 0 ||
		tocPopoverOptions.header !== undefined ||
		tocPopoverOptions.footer !== undefined;

	return (
		<AnchorProvider toc={toc} single={tocOptions.single}>
			<PageBody
				{...props.container}
				className={cn(props.container?.className)}
				style={
					{
						"--fd-tocnav-height": !tocPopoverEnabled ? "0px" : undefined,
						...props.container?.style,
					} as object
				}
			>
				{replaceOrDefault(
					{ enabled: tocPopoverEnabled, component: tocPopoverReplace },
					<TocPopoverHeader className="h-10">
						<TocPopoverTrigger className="w-full" items={toc} />
						<TocPopoverContent>
							{tocPopoverOptions.header}
							<TOCScrollArea isMenu>
								<TOCItems items={toc} />
							</TOCScrollArea>
							{tocPopoverOptions.footer}
						</TocPopoverContent>
					</TocPopoverHeader>,
					{
						items: toc,
						...tocPopoverOptions,
					},
				)}
				<PageArticle
					{...props.article}
					className={cn(
						full || !tocEnabled ? "max-w-[1120px]" : "max-w-[860px]",
						props.article?.className,
					)}
				>
					{props.children}
					<div role="none" className="flex-1" />
					<div className="flex flex-row flex-wrap items-center justify-between gap-4 empty:hidden">
						{props.editOnGithub ? (
							<EditOnGitHub {...props.editOnGithub} />
						) : null}
						{props.lastUpdate ? (
							<LastUpdate date={new Date(props.lastUpdate)} />
						) : null}
					</div>
					{replaceOrDefault(
						props.footer,
						<Footer items={props.footer?.items} />,
					)}
				</PageArticle>
			</PageBody>
			{replaceOrDefault(
				{ enabled: tocEnabled, component: tocReplace },
				<Toc>
					{tocOptions.header}
					<h3 className="inline-flex items-center gap-1.5 text-sm text-fd-muted-foreground">
						<Text className="size-4" />
						<I18nLabel label="toc" />
					</h3>
					<TOCScrollArea>
						<TOCItems items={toc} />
					</TOCScrollArea>
					{tocOptions.footer}
				</Toc>,
				{
					items: toc,
					...tocOptions,
				},
			)}
		</AnchorProvider>
	);
}

function EditOnGitHub({
	owner,
	repo,
	branch = "canary",
	path,
	...props
}: EditOnGitHubOptions) {
	const href = `https://github.com/${owner}/${repo}/blob/${branch}/${path.startsWith("/") ? path.slice(1) : path}`;

	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			{...props}
			className={cn(
				buttonVariants({
					color: "secondary",
					className: "gap-1.5 text-fd-muted-foreground",
				}),
				props.className,
			)}
		>
			<Edit className="size-3.5" />
			<I18nLabel label="editOnGithub" />
		</a>
	);
}

/**
 * Add typography styles
 */
export const DocsBody = forwardRef<
	HTMLDivElement,
	HTMLAttributes<HTMLDivElement>
>((props, ref) => (
	<div ref={ref} {...props} className={cn("prose", props.className)}>
		{props.children}
	</div>
));

DocsBody.displayName = "DocsBody";

export const DocsDescription = forwardRef<
	HTMLParagraphElement,
	HTMLAttributes<HTMLParagraphElement>
>((props, ref) => {
	// don't render if no description provided
	if (props.children === undefined) return null;

	return (
		<p
			ref={ref}
			{...props}
			className={cn("mb-8 text-lg text-fd-muted-foreground", props.className)}
		>
			{props.children}
		</p>
	);
});

DocsDescription.displayName = "DocsDescription";

export const DocsTitle = forwardRef<
	HTMLHeadingElement,
	HTMLAttributes<HTMLHeadingElement>
>((props, ref) => {
	return (
		<h1
			ref={ref}
			{...props}
			className={cn("text-3xl font-semibold", props.className)}
		>
			{props.children}
		</h1>
	);
});

DocsTitle.displayName = "DocsTitle";

/**
 * For separate MDX page
 */
export function withArticle({ children }: { children: ReactNode }): ReactNode {
	return (
		<main className="container py-12">
			<article className="prose">{children}</article>
		</main>
	);
}
