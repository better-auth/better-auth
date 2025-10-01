import { source } from "@/lib/source";
import { DocsPage, DocsBody, DocsTitle } from "@/components/docs/page";
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
import {
	CodeBlock,
	Pre,
	CodeBlockTab,
	CodeBlockTabsList,
	CodeBlockTabs,
} from "@/components/ui/code-block";
import { File, Folder, Files } from "fumadocs-ui/components/files";
import { AutoTypeTable } from "fumadocs-typescript/ui";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Endpoint } from "@/components/endpoint";
import { DividerText } from "@/components/divider-text";
import { APIMethod } from "@/components/api-method";
import { LLMCopyButton, ViewOptions } from "./page.client";
import { GenerateAppleJwt } from "@/components/generate-apple-jwt";
import { Callout } from "@/components/ui/callout";
import { AddToCursor } from "@/components/mdx/add-to-cursor";
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

	const MDX = page.data.body;
	const avoidLLMHeader = ["Introduction", "Comparison"];
	return (
		<DocsPage
			toc={page.data.toc}
			full={page.data.full}
			editOnGithub={{
				owner: "better-auth",
				repo: "better-auth",
				sha: process.env.VERCEL_GIT_COMMIT_SHA || "main",
				path: `/docs/content/docs/${page.path}`,
			}}
			tableOfContent={{
				header: <div className="w-10 h-4"></div>,
			}}
		>
			<DocsTitle>{page.data.title}</DocsTitle>
			{!avoidLLMHeader.includes(page.data.title) && (
				<div className="flex flex-row gap-2 items-center pb-3 border-b">
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
						CodeBlockTabs: (props) => {
							return (
								<CodeBlockTabs
									{...props}
									className="p-0 border-0 rounded-lg bg-fd-secondary"
								>
									<div {...props}>{props.children}</div>
								</CodeBlockTabs>
							);
						},
						CodeBlockTabsList: (props) => {
							return (
								<CodeBlockTabsList
									{...props}
									className="pb-0 my-0 rounded-lg bg-fd-secondary"
								/>
							);
						},
						CodeBlockTab: (props) => {
							return <CodeBlockTab {...props} className="p-0 m-0 rounded-lg" />;
						},
						pre: (props) => {
							return (
								<CodeBlock className="rounded-xl bg-fd-muted" {...props}>
									<div style={{ minWidth: "100%", display: "table" }}>
										<Pre className="px-0 py-3 bg-fd-muted focus-visible:outline-none">
											{props.children}
										</Pre>
									</div>
								</CodeBlock>
							);
						},
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
						GenerateAppleJwt,
						AnimatePresence,
						TypeTable,
						Features,
						ForkButton,
						AddToCursor,
						DatabaseTable,
						Accordion,
						Accordions,
						Endpoint,
						APIMethod,
						Callout: ({
							children,
							type,
							...props
						}: {
							children: React.ReactNode;
							type?: "info" | "warn" | "error" | "success" | "warning";
							[key: string]: any;
						}) => (
							<Callout type={type} {...props}>
								{children}
							</Callout>
						),
						DividerText,
						iframe: (props) => (
							<iframe {...props} className="w-full h-[500px]" />
						),
					}}
				/>
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
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
