import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsTitle } from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/utils";
import DatabaseTable from "@/components/mdx/database-tables";
import { cn } from "@/lib/utils";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { GenerateSecret } from "@/components/generate-secret";
import { AnimatePresence } from "@/components/ui/fade-in";
import { TypeTable } from "fumadocs-ui/components/type-table";
import { Features } from "@/components/blocks/features";
import { ForkButton } from "@/components/fork-button";
import Link from "next/link";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { File, Folder, Files } from "fumadocs-ui/components/files";
import { createTypeTable } from "fumadocs-typescript/ui";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Card, Cards } from "fumadocs-ui/components/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { contents } from "@/components/sidebar-content";
import { Endpoint } from "@/components/endpoint";
import { DividerText } from "@/components/divider-text";
import { LLMCopyButton, ViewOptions } from "./page.client";

const { AutoTypeTable } = createTypeTable();

export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const page = source.getPage(slug);

	if (!page) {
		notFound();
	}

	const { nextPage, prevPage } = getPageLinks(page.url);

	const MDX = page.data.body;
	const avoidLLMHeader = ["Introduction", "Comparison"];
	return (
		<DocsPage
			toc={page.data.toc}
			full={page.data.full}
			editOnGithub={{
				owner: "better-auth",
				repo: "better-auth",
				sha: "main",
				path: `/docs/content/docs/${page.file.path}`,
			}}
			tableOfContent={{
				style: "clerk",
				header: <div className="w-10 h-4"></div>,
			}}
			footer={{
				enabled: true,
				component: <div className="w-10 h-4" />,
			}}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			{!avoidLLMHeader.includes(page.data.title) && (
				<div className="flex flex-row gap-2 items-center border-b pb-3">
					<LLMCopyButton />
					<ViewOptions
						markdownUrl={`${page.url}.mdx`}
						githubUrl={`https://github.com/better-auth/better-auth/blob/main/docs/content/docs/${page.file.path}`}
					/>
				</div>
			)}
			<DocsBody>
				<MDX
					components={{
						...defaultMdxComponents,
						Link: ({
							className,
							...props
						}: React.ComponentProps<typeof Link>) => (
							<Link
								className={cn(
									"font-medium underline underline-offset-4",
									className,
								)}
								{...props}
							/>
						),
						Step,
						Steps,
						File,
						Folder,
						Files,
						Tab,
						Tabs,
						AutoTypeTable,
						GenerateSecret,
						AnimatePresence,
						TypeTable,
						Features,
						ForkButton,
						DatabaseTable,
						Accordion,
						Accordions,
						Endpoint,
						Callout: ({ children, ...props }) => (
							<defaultMdxComponents.Callout
								{...props}
								className={cn(
									props,
									"bg-none rounded-none border-dashed border-border",
									props.type === "info" && "border-l-blue-500/50",
									props.type === "warn" && "border-l-amber-700/50",
									props.type === "error" && "border-l-red-500/50",
								)}
							>
								{children}
							</defaultMdxComponents.Callout>
						),
						DividerText,
						iframe: (props) => (
							<iframe {...props} className="w-full h-[500px]" />
						),
					}}
				/>

				<Cards className="mt-16">
					{prevPage ? (
						<Card
							href={prevPage.url}
							className="[&>p]:ml-1 [&>p]:truncate [&>p]:w-full"
							description={<>{prevPage.data.description}</>}
							title={
								<div className="flex items-center gap-1">
									<ChevronLeft className="size-4" />
									{prevPage.data.title}
								</div>
							}
						/>
					) : (
						<div></div>
					)}
					{nextPage ? (
						<Card
							href={nextPage.url}
							description={<>{nextPage.data.description}</>}
							title={
								<div className="flex items-center gap-1">
									{nextPage.data.title}
									<ChevronRight className="size-4" />
								</div>
							}
							className="flex flex-col items-end text-right [&>p]:ml-1 [&>p]:truncate [&>p]:w-full"
						/>
					) : (
						<div></div>
					)}
				</Cards>
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
	const res = source.getPages().map((page) => ({
		slug: page.slugs,
	}));
	return source.generateParams();
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const page = source.getPage(slug);
	if (page == null) notFound();
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const url = new URL(`${baseUrl}/api/og`);
	const { title, description } = page.data;
	const pageSlug = page.file.path;
	url.searchParams.set("type", "Documentation");
	url.searchParams.set("mode", "dark");
	url.searchParams.set("heading", `${title}`);

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: absoluteUrl(`docs/${pageSlug}`),
			images: [
				{
					url: url.toString(),
					width: 1200,
					height: 630,
					alt: title,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [url.toString()],
		},
	};
}

function getPageLinks(path: string) {
	const current_category_index = contents.findIndex(
		(x) => x.list.find((x) => x.href === path)!,
	)!;
	const current_category = contents[current_category_index];
	if (!current_category) return { nextPage: undefined, prevPage: undefined };

	// user's current page.
	const current_page = current_category.list.find((x) => x.href === path)!;

	// the next page in the array.
	let next_page = current_category.list.filter((x) => !x.group)[
		current_category.list
			.filter((x) => !x.group)
			.findIndex((x) => x.href === current_page.href) + 1
	];
	//if there isn't a next page, then go to next cat's page.
	if (!next_page) {
		// get next cat
		let next_category = contents[current_category_index + 1];
		// if doesn't exist, return to first cat.
		if (!next_category) next_category = contents[0];

		next_page = next_category.list[0];
		if (next_page.group) {
			next_page = next_category.list[1];
		}
	}
	// the prev page in the array.
	let prev_page = current_category.list.filter((x) => !x.group)[
		current_category.list
			.filter((x) => !x.group)
			.findIndex((x) => x.href === current_page.href) - 1
	];
	// if there isn't a prev page, then go to prev cat's page.
	if (!prev_page) {
		// get prev cat
		let prev_category = contents[current_category_index - 1];
		// if doesn't exist, return to last cat.
		if (!prev_category) prev_category = contents[contents.length - 1];
		prev_page = prev_category.list[prev_category.list.length - 1];
		if (prev_page.group) {
			prev_page = prev_category.list[prev_category.list.length - 2];
		}
	}

	const pages = source.getPages();
	let next_page2 = pages.find((x) => x.url === next_page.href);
	let prev_page2 = pages.find((x) => x.url === prev_page.href);
	if (path === "/docs/introduction") prev_page2 = undefined;
	return { nextPage: next_page2, prevPage: prev_page2 };
}
