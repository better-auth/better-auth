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
import { MilestoneIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { APIMethod } from "@/components/api-method";
import { Features } from "@/components/docs/features";
import {
	AddToCursor,
	DatabaseTable,
	DividerText,
	Endpoint,
	ForkButton,
	GenerateAppleJwt,
	GenerateSecret,
} from "@/components/docs/mdx-components";
import { Callout } from "@/components/ui/callout";
import { docsVersionSources } from "@/lib/docs-version-sources";
import type { DocsVersion } from "@/lib/docs-versions";
import {
	docsVersions,
	resolveVersionFromSlug,
	scopeDocsHref,
} from "@/lib/docs-versions";
import { getMarkdownPageUrl } from "@/lib/llm-text";
import { createMetadata } from "@/lib/metadata";
import { getSourceFor } from "@/lib/source";
import { cn } from "@/lib/utils";
import { LLMCopyButton, ViewOptions } from "./page.client";

export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const { version, relSlug } = resolveVersionFromSlug(slug ?? []);
	const src = getSourceFor(version.id);
	const page = src.getPage(relSlug);

	if (!page) {
		return notFound();
	}

	const { body: MDX, toc } = await page.data.load();

	const versionSource = docsVersionSources[version.id];
	const contentRef = versionSource.commitSha ?? versionSource.editBranch;
	const githubBase = `https://github.com/better-auth/better-auth/blob/${contentRef}/docs/content/docs`;
	const markdownUrl = getMarkdownPageUrl(page.url);

	// Keep every absolute /docs link scoped to the version being viewed.
	const scope = (href: string | undefined) => scopeDocsHref(href, version);
	const DefaultAnchor = defaultMdxComponents.a;
	const DefaultCard = defaultMdxComponents.Card;

	return (
		<DocsPage
			toc={toc}
			full={false}
			tableOfContent={{
				style: "clerk",
			}}
			breadcrumb={{ enabled: false }}
			editOnGithub={{
				owner: "better-auth",
				repo: "better-auth",
				sha: versionSource.editBranch,
				path: `docs/content/docs/${page.path}`,
			}}
		>
			{version.id !== "latest" ? <VersionBanner version={version} /> : null}
			<div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="min-w-0">
					<DocsTitle className="mb-0">{page.data.title}</DocsTitle>
					{page.data.description && (
						<DocsDescription className="mt-2 mb-0">
							{page.data.description}
						</DocsDescription>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2 not-prose lg:shrink-0">
					<LLMCopyButton markdownUrl={markdownUrl} />
					<ViewOptions
						markdownUrl={markdownUrl}
						githubUrl={`${githubBase}/${page.path}`}
					/>
				</div>
			</div>
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
						HeaderLabel: ({
							children,
							variant = "default",
						}: {
							children: React.ReactNode;
							variant?: "default" | "info" | "warning";
						}) => {
							const colors = {
								default: "text-neutral-600 dark:text-neutral-300",
								info: "text-blue-500 dark:text-blue-400",
								warning: "text-amber-600 dark:text-amber-400",
							};
							return (
								<span
									data-header-label="true"
									className={`text-[11px] font-semibold tracking-wide not-prose block select-none ${colors[variant]}`}
								>
									{children}
								</span>
							);
						},
						iframe: (props: React.ComponentProps<"iframe">) => (
							<iframe
								title="Embedded content"
								{...props}
								className="w-full h-[500px]"
							/>
						),
						a: (props: React.ComponentProps<"a">) => (
							<DefaultAnchor {...props} href={scope(props.href)} />
						),
						Card: ({ href, ...props }) => (
							<DefaultCard href={scope(href) ?? href} {...props} />
						),
						Link: ({
							href,
							className,
							...props
						}: React.ComponentProps<typeof Link>) => (
							<Link
								href={typeof href === "string" ? (scope(href) ?? href) : href}
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

function VersionBanner({ version }: { version: DocsVersion }) {
	return (
		<div className="mb-2 flex items-center gap-3 py-2.5 text-sm text-blue-600 dark:text-blue-400 text-pretty">
			<MilestoneIcon size={18} className="shrink-0" fill="currentColor" />
			<p>
				You are currently viewing documentation for{" "}
				<span className="bg-blue-600/10 dark:bg-blue-400/15 px-1 py-0.5 rounded-lg font-medium tracking-wider">
					{version.label}
				</span>
			</p>
		</div>
	);
}

export async function generateStaticParams() {
	return docsVersions.flatMap((v) => {
		const src = getSourceFor(v.id);
		return src.generateParams().map((p) => ({
			slug: v.id !== "latest" ? [v.id, ...(p.slug ?? [])] : p.slug,
		}));
	});
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const { version, relSlug } = resolveVersionFromSlug(slug ?? []);
	const src = getSourceFor(version.id);
	const page = src.getPage(relSlug);
	if (!page) return notFound();

	const title =
		version.id !== "latest"
			? `${version.label} - ${page.data.title}`
			: page.data.title;

	const ogSearchParams = new URLSearchParams();
	ogSearchParams.set("heading", title);
	ogSearchParams.set("type", "documentation");
	ogSearchParams.set("mode", "dark");

	const ogUrl = `/api/og?${ogSearchParams.toString()}`;

	return createMetadata({
		title,
		description: page.data.description,
		alternates: {
			canonical: page.url,
			types: {
				"text/markdown": getMarkdownPageUrl(page.url),
			},
		},
		openGraph: {
			title,
			description: page.data.description,
			type: "article",
			images: [
				{
					url: ogUrl,
					width: 1200,
					height: 630,
					alt: title,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description: page.data.description,
			images: [ogUrl],
		},
	});
}
