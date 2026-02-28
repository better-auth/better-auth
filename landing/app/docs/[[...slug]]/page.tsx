import type { TOCItemType } from "fumadocs-core/toc";
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/page";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APIMethod } from "@/components/api-method";
import {
	AddToCursor,
	DatabaseTable,
	DividerText,
	Endpoint,
	Features,
	ForkButton,
	GenerateAppleJwt,
	GenerateSecret,
} from "@/components/docs/mdx-components";
import type { StepperTOCItem } from "@/components/docs/stepper-toc";
import { StepperTOC } from "@/components/docs/stepper-toc";
import { Callout } from "@/components/ui/callout";
import { getSource } from "@/lib/source";
import { cn } from "@/lib/utils";
import { LLMCopyButton, ViewOptions } from "./page.client";

function groupTocItems(toc: TOCItemType[]): StepperTOCItem[] {
	const grouped: StepperTOCItem[] = [];
	for (const item of toc) {
		if (item.depth <= 2) {
			grouped.push({ ...item, subheadings: [] });
		} else if (grouped.length > 0) {
			grouped[grouped.length - 1].subheadings.push(item);
		}
	}
	return grouped;
}

export default async function Page({
	params,
	searchParams,
}: {
	params: Promise<{ slug?: string[] }>;
	searchParams: Promise<{ branch?: string }>;
}) {
	const { slug } = await params;
	const { branch } = await searchParams;
	const source = getSource(branch);
	const page = source.getPage(slug);

	if (!page) {
		return notFound();
	}

	const MDX = page.data.body;
	const groupedToc = groupTocItems(page.data.toc);
	const gitBranch = branch === "canary" ? "canary" : "main";

	return (
		<DocsPage
			toc={page.data.toc}
			full={false}
			tableOfContent={{ enabled: false }}
			tableOfContentPopover={{ enabled: false }}
			breadcrumb={{ enabled: false }}
			editOnGithub={{
				owner: "better-auth",
				repo: "better-auth",
				sha: gitBranch,
				path: `docs/content/docs/${page.path}`,
			}}
		>
			<StepperTOC items={groupedToc}>
				<LLMCopyButton />
				<ViewOptions
					markdownUrl={`${page.url}.mdx`}
					githubUrl={`https://github.com/better-auth/better-auth/blob/${gitBranch}/docs/content/docs/${page.path}`}
				/>
			</StepperTOC>
			<DocsTitle>{page.data.title}</DocsTitle>
			{page.data.description && (
				<DocsDescription>{page.data.description}</DocsDescription>
			)}
			<DocsBody>
				<MDX
					components={{
						...defaultMdxComponents,
						Step,
						Steps,
						Tab,
						Tabs,
						Accordion,
						Accordions,
						File,
						Files,
						Folder,
						TypeTable,
						APIMethod,
						DatabaseTable,
						ForkButton,
						AddToCursor,
						Features,
						Endpoint,
						GenerateAppleJwt,
						GenerateSecret,
						DividerText,
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
						iframe: (props: React.ComponentProps<"iframe">) => (
							<iframe
								title="Embedded content"
								{...props}
								className="w-full h-[500px]"
							/>
						),
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
					}}
				/>
			</DocsBody>
		</DocsPage>
	);
}

export async function generateStaticParams() {
	const source = getSource();
	return source.generateParams();
}

export async function generateMetadata({
	params,
	searchParams,
}: {
	params: Promise<{ slug?: string[] }>;
	searchParams: Promise<{ branch?: string }>;
}) {
	const { slug } = await params;
	const { branch } = await searchParams;
	const source = getSource(branch);
	const page = source.getPage(slug);
	if (!page) return notFound();

	return {
		title: page.data.title,
		description: page.data.description,
	};
}
