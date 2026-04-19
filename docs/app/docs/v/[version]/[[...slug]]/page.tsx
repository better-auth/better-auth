import { remarkHeading } from "fumadocs-core/mdx-plugins/remark-heading";
import type { TableOfContents } from "fumadocs-core/toc";
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
import matter from "gray-matter";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
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
import { getVersionBySlug } from "@/lib/docs-versions";
import { createMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

function extractToc(content: string): TableOfContents {
	const slugCount = new Map<string, number>();
	const headingRegex = /^(#{2,4})\s+(.+)$/gm;
	const toc: TableOfContents = [];
	let match: RegExpExecArray | null;
	while ((match = headingRegex.exec(content)) !== null) {
		const depth = match[1].length;
		const raw = match[2].trim();
		// Strip custom id syntax [#custom-id]
		const title = raw.replace(/\s*\[#[^\]]+\]\s*$/, "");
		let slug = title
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-");
		const count = slugCount.get(slug) ?? 0;
		slugCount.set(slug, count + 1);
		if (count > 0) slug = `${slug}-${count}`;
		toc.push({ title, url: `#${slug}`, depth });
	}
	return toc;
}

async function fetchRemoteMDX(branch: string, slug: string[]) {
	const path = slug.length > 0 ? slug.join("/") : "index";
	const url = `https://raw.githubusercontent.com/better-auth/better-auth/${branch}/docs/content/docs/${path}.mdx`;

	const res = await fetch(url, {
		next: { revalidate: 300 },
	});

	if (!res.ok) return null;

	const raw = await res.text();
	const { data: frontmatter, content } = matter(raw);
	return { frontmatter, content, path };
}

const mdxComponents = {
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
		[key: string]: unknown;
	}) => (
		<Callout type={type} {...props}>
			{children}
		</Callout>
	),
	iframe: (props: React.ComponentProps<"iframe">) => (
		<iframe title="Embedded content" {...props} className="w-full h-[500px]" />
	),
	Link: ({ className, ...props }: React.ComponentProps<typeof Link>) => (
		<Link
			className={cn("font-medium underline underline-offset-4", className)}
			{...props}
		/>
	),
};

export default async function VersionedDocsPage({
	params,
}: {
	params: Promise<{ version: string; slug?: string[] }>;
}) {
	const { version: versionSlug, slug } = await params;
	const version = getVersionBySlug(versionSlug);

	if (!version) return notFound();

	const result = await fetchRemoteMDX(version.branch, slug ?? []);

	if (!result) return notFound();

	const { frontmatter, content } = result;
	const title = (frontmatter.title as string) || "Untitled";
	const description = frontmatter.description as string | undefined;
	const toc = extractToc(content);

	return (
		<DocsPage
			toc={toc}
			full={false}
			tableOfContent={{ style: "clerk" }}
			breadcrumb={{ enabled: false }}
			editOnGithub={{
				owner: "better-auth",
				repo: "better-auth",
				sha: version.branch,
				path: `docs/content/docs/${result.path}`,
			}}
		>
			{/* Pre-release banner */}
			<div className="mb-2 flex items-center gap-2 border-b border-dashed border-amber-500/40 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400">
				<svg
					className="size-4 shrink-0"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					aria-hidden="true"
				>
					<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
					<path d="M12 9v4" />
					<path d="M12 17h.01" />
				</svg>
				<span>
					You&apos;re viewing docs for a pre-release version ({version.label}).
					<Link
						href={`/docs/${slug?.join("/") ?? ""}`}
						className="ml-1 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-300"
					>
						Switch to latest
					</Link>
				</span>
			</div>

			<DocsTitle className="mb-0">{title}</DocsTitle>
			{description && <DocsDescription>{description}</DocsDescription>}
			<DocsBody>
				<MDXRemote
					source={content}
					components={mdxComponents}
					options={{
						mdxOptions: {
							remarkPlugins: [[remarkHeading, { generateToc: false }]],
						},
					}}
				/>
			</DocsBody>
		</DocsPage>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ version: string; slug?: string[] }>;
}) {
	const { version: versionSlug, slug } = await params;
	const version = getVersionBySlug(versionSlug);

	if (!version) return {};

	const result = await fetchRemoteMDX(version.branch, slug ?? []);
	if (!result) return {};

	const title = `${result.frontmatter.title || "Docs"} (${version.label})`;
	const description = result.frontmatter.description as string | undefined;

	return createMetadata({
		title,
		description,
	});
}
