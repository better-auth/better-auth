"use client";

import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkEmoji from "remark-emoji";
import remarkGfm from "remark-gfm";
import { DynamicCodeBlock } from "@/components/ui/dynamic-code-block";
import { remarkGithubAlerts } from "@/lib/marketplace/remark-github-alerts";
import { readmeBaseDir, resolveReadmeUrl } from "@/lib/marketplace/urls";
import { cn } from "@/lib/utils";
import { GithubAlert, normalizeGithubAlertType } from "./github-alert";

function getLanguage(className?: string): string {
	const match = /language-([^\s]+)/.exec(className ?? "");
	return match?.[1] ?? "text";
}

function resolveSrcSet(
	srcSet: string | undefined,
	repo: string,
	branch: string,
	baseDir: string,
): string | undefined {
	if (!srcSet?.trim()) return undefined;
	const parts = srcSet
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
	const resolved: string[] = [];
	for (const part of parts) {
		const [url, ...descriptors] = part.split(/\s+/);
		if (!url) return undefined;
		const safe = resolveReadmeUrl(url, repo, branch, "image", baseDir);
		if (!safe) return undefined;
		resolved.push([safe, ...descriptors].join(" "));
	}
	return resolved.length > 0 ? resolved.join(", ") : undefined;
}

function getNodeClassName(
	node: { properties?: { className?: unknown } } | undefined,
): string[] {
	const value = node?.properties?.className;
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
	return [];
}

/**
 * GitHub-style sanitize schema with a few extras commonly used in README HTML
 * (picture/source, align, alerts, task lists). Scripts/handlers are dropped.
 */
const marketplaceSanitizeSchema: typeof defaultSchema = {
	...defaultSchema,
	tagNames: [
		...(defaultSchema.tagNames ?? []),
		"picture",
		"source",
		"video",
		"details",
		"summary",
		"aside",
		"section",
	],
	attributes: {
		...defaultSchema.attributes,
		"*": [
			...(defaultSchema.attributes?.["*"] ?? []),
			"className",
			"align",
			"dataAlert",
			["data-alert", /^[a-z]+$/],
		],
		img: [
			...(defaultSchema.attributes?.img ?? []),
			["src", /^https?:\/\//i],
			"srcSet",
			"width",
			"height",
			"alt",
			"title",
			"loading",
		],
		source: [
			["src", /^https?:\/\//i],
			["srcSet", /^https?:\/\//i],
			"type",
			"media",
		],
		a: [
			...(defaultSchema.attributes?.a ?? []),
			["href", /^(https?:\/\/|mailto:|#)/i],
			"target",
			"rel",
		],
		code: [
			...(defaultSchema.attributes?.code ?? []),
			["className", /^language-/],
		],
		input: [
			...(defaultSchema.attributes?.input ?? []),
			["type", "checkbox"],
			"checked",
			"disabled",
		],
		blockquote: [
			...(defaultSchema.attributes?.blockquote ?? []),
			"className",
			["data-alert", /^(note|tip|important|warning|caution)$/],
		],
	},
	protocols: {
		...defaultSchema.protocols,
		href: ["http", "https", "mailto"],
		src: ["http", "https"],
		srcSet: ["http", "https"],
	},
};

export function MarketplaceReadme({
	content,
	repo,
	branch,
	readmeFilePath,
	className,
}: {
	content: string;
	repo: string;
	branch: string;
	readmeFilePath?: string | null;
	className?: string;
}) {
	const baseDir = readmeBaseDir(readmeFilePath);

	const components: Components = {
		// GitHub: <div align="center"> keeps badge <a>/<img> inline in a row.
		div: ({ children, node }) => {
			const alignAttr = node?.properties?.align;
			const align =
				typeof alignAttr === "string" ? alignAttr.toLowerCase() : undefined;
			const classes = getNodeClassName(node);
			// Footnotes section from remark-gfm
			if (classes.includes("footnotes")) {
				return (
					<section className="mt-10 border-t border-foreground/10 pt-6 text-sm text-muted-foreground">
						{children}
					</section>
				);
			}
			return (
				<div
					className={cn(
						"my-4",
						align === "center" && "text-center",
						align === "left" && "text-left",
						align === "right" && "text-right",
					)}
				>
					{children}
				</div>
			);
		},
		h1: ({ children, id }) => (
			<h1
				id={id}
				className="mt-8 mb-4 scroll-mt-24 text-2xl font-semibold tracking-tight text-neutral-800 first:mt-0 dark:text-neutral-200 [&_code]:text-xl"
			>
				{children}
			</h1>
		),
		h2: ({ children, id }) => (
			<h2
				id={id}
				className="mt-8 mb-3 scroll-mt-24 text-xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-200 [&_code]:text-lg"
			>
				{children}
			</h2>
		),
		h3: ({ children, id }) => (
			<h3
				id={id}
				className="mt-6 mb-2 scroll-mt-24 text-lg font-semibold tracking-tight text-neutral-700 dark:text-neutral-300"
			>
				{children}
			</h3>
		),
		h4: ({ children, id }) => (
			<h4
				id={id}
				className="mt-5 mb-2 scroll-mt-24 text-base font-semibold tracking-tight text-neutral-700 dark:text-neutral-300"
			>
				{children}
			</h4>
		),
		p: ({ children }) => (
			<p className="my-3 text-sm leading-7 text-muted-foreground">{children}</p>
		),
		ul: ({ children, node }) => {
			const classes = getNodeClassName(node);
			const isTaskList = classes.includes("contains-task-list");
			return (
				<ul
					className={cn(
						"my-3 space-y-1.5",
						isTaskList
							? "list-none pl-0"
							: "in-[ul]:mt-1.5 in-[ul]:mb-0 in-[ul]:ml-2",
					)}
				>
					{children}
				</ul>
			);
		},
		ol: ({ children }) => (
			<ol className="my-3 list-decimal space-y-1.5 pl-5">{children}</ol>
		),
		li: ({ children, node }) => {
			const classes = getNodeClassName(node);
			const isTask = classes.includes("task-list-item");
			return (
				<li
					className={cn(
						"text-sm leading-relaxed text-muted-foreground",
						isTask
							? "flex list-none items-start gap-2 pl-0"
							: "relative pl-4 before:absolute before:left-0 before:text-foreground/50 before:content-['-'] in-[ol]:before:content-none",
					)}
				>
					{children}
				</li>
			);
		},
		input: ({ type, checked, disabled }) => {
			if (type !== "checkbox") return null;
			return (
				<input
					type="checkbox"
					checked={Boolean(checked)}
					disabled
					readOnly
					className="mt-1 size-3.5 shrink-0 accent-foreground"
					aria-hidden
				/>
			);
		},
		a: ({ href, children }) => {
			const safeHref = resolveReadmeUrl(href, repo, branch, "link", baseDir);
			if (!safeHref) {
				return <span>{children}</span>;
			}
			const external = !safeHref.startsWith("#");
			return (
				<a
					href={safeHref}
					target={external ? "_blank" : undefined}
					rel={external ? "noopener noreferrer nofollow" : undefined}
					className={cn(
						"inline-block text-foreground underline decoration-foreground/25 underline-offset-2 transition-colors hover:decoration-foreground/60",
						// Badge / shield links: sit in a horizontal row like GitHub
						"[&:has(img)]:mx-0.5 [&:has(img)]:no-underline",
					)}
				>
					{children}
				</a>
			);
		},
		img: ({ src, srcSet, alt, width, height }) => {
			const safeSrc = resolveReadmeUrl(
				typeof src === "string" ? src : undefined,
				repo,
				branch,
				"image",
				baseDir,
			);
			const safeSrcSet = resolveSrcSet(
				typeof srcSet === "string" ? srcSet : undefined,
				repo,
				branch,
				baseDir,
			);
			if (!safeSrc && !safeSrcSet) return null;
			// Tailwind preflight sets img { display:block }, which stacks GitHub
			// shield badges vertically — force inline-block to match GitHub.
			const isBadge =
				safeSrc != null &&
				/shields\.io|badge\.fury|img\.shields|badgen\.net|cdn\.jsdelivr\.net\/gh\/badges/i.test(
					safeSrc,
				);
			return (
				<img
					src={safeSrc}
					srcSet={safeSrcSet}
					alt={alt ?? ""}
					width={
						typeof width === "string" || typeof width === "number"
							? width
							: undefined
					}
					height={
						typeof height === "string" || typeof height === "number"
							? height
							: undefined
					}
					className={cn(
						"inline-block h-auto max-w-full align-middle",
						isBadge ? "my-1" : "my-3 border border-foreground/10",
					)}
					loading="lazy"
					referrerPolicy="no-referrer"
				/>
			);
		},
		picture: ({ children }) => (
			<picture className="my-3 inline-block max-w-full">{children}</picture>
		),
		blockquote: ({ children, node, className, ...rest }) => {
			const nodeProps = node?.properties ?? {};
			const directAlert = (rest as { "data-alert"?: unknown })["data-alert"];
			const alertAttr =
				directAlert ?? nodeProps["data-alert"] ?? nodeProps.dataAlert;
			const classes = [
				...getNodeClassName(node),
				...(typeof className === "string" ? className.split(/\s+/) : []),
			];
			const alertFromClass = classes
				.find((c) => c.startsWith("markdown-alert-") && c !== "markdown-alert")
				?.replace("markdown-alert-", "");
			const alertType = normalizeGithubAlertType(
				typeof alertAttr === "string" ? alertAttr : (alertFromClass ?? ""),
			);

			if (alertType) {
				return <GithubAlert type={alertType}>{children}</GithubAlert>;
			}

			return (
				<blockquote className="my-4 border-l-2 border-foreground/20 pl-4 text-sm text-muted-foreground italic">
					{children}
				</blockquote>
			);
		},
		del: ({ children }) => (
			<del className="text-muted-foreground/70 line-through">{children}</del>
		),
		details: ({ children }) => (
			<details className="my-4 border border-foreground/10 px-4 py-3 text-sm open:pb-4">
				{children}
			</details>
		),
		summary: ({ children }) => (
			<summary className="cursor-pointer font-medium text-foreground/80 marker:text-foreground/40">
				{children}
			</summary>
		),
		hr: () => <hr className="my-8 border-foreground/10" />,
		table: ({ children }) => (
			<div className="my-4 overflow-x-auto border border-foreground/10">
				<table className="w-full text-left text-sm">{children}</table>
			</div>
		),
		th: ({ children }) => (
			<th className="border-b border-foreground/10 bg-foreground/[0.03] px-3 py-2 font-mono text-xs font-medium text-foreground/70">
				{children}
			</th>
		),
		td: ({ children }) => (
			<td className="border-b border-foreground/5 px-3 py-2 text-sm text-muted-foreground">
				{children}
			</td>
		),
		code: ({ className, children }) => {
			const isBlock = Boolean(className?.includes("language-"));
			if (!isBlock) {
				return (
					<code className="rounded-sm bg-foreground/[0.06] px-1 py-0.5 font-mono text-[0.85em] text-foreground/85">
						{children}
					</code>
				);
			}
			const code = String(children).replace(/\n$/, "");
			return (
				<div className="my-4">
					{/* DynamicCodeBlock defaults to border-t-0 (docs headers supply the top edge). */}
					<DynamicCodeBlock
						lang={getLanguage(className)}
						code={code}
						codeblock={{ className: "border-t" }}
					/>
				</div>
			);
		},
		pre: ({ children }) => <>{children}</>,
		sup: ({ children }) => (
			<sup className="text-[0.7em] text-foreground/70">{children}</sup>
		),
	};

	return (
		<div className={cn("marketplace-readme max-w-3xl", className)}>
			{/*
			  Security: parse embedded HTML (rehype-raw) then strip anything not
			  allowed by GitHub-style sanitation. Custom components also avoid
			  spreading raw props and only emit allowlisted http(s)/mailto/# URLs.
			*/}
			<Markdown
				remarkPlugins={[remarkGfm, remarkEmoji, remarkGithubAlerts]}
				rehypePlugins={[
					// Raw HTML before slug so HTML headings also get anchor ids.
					rehypeRaw,
					rehypeSlug,
					[rehypeSanitize, marketplaceSanitizeSchema],
				]}
				urlTransform={(url) => {
					// react-markdown's default already blocks javascript:;
					// keep only schemes we accept, as a first-pass filter.
					const lower = url.toLowerCase();
					if (
						url.startsWith("#") ||
						lower.startsWith("mailto:") ||
						lower.startsWith("http://") ||
						lower.startsWith("https://") ||
						url.startsWith("/") ||
						url.startsWith("./") ||
						url.startsWith("../") ||
						!/^[a-z][a-z0-9+.-]*:/i.test(url)
					) {
						return url;
					}
					return "";
				}}
				components={components}
			>
				{content}
			</Markdown>
		</div>
	);
}
