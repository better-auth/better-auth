import { blogs } from "@/lib/source";
import { notFound } from "next/navigation";
import { absoluteUrl, formatDate } from "@/lib/utils";
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
import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Pre } from "fumadocs-ui/components/codeblock";
import { Glow } from "../_components/default-changelog";
import { XIcon } from "../_components/icons";
import { StarField } from "../_components/stat-field";
import Image from "next/image";
import { BlogPage } from "../_components/blog-list";
import { Callout } from "@/components/ui/callout";
import { ArrowLeftIcon, ExternalLink } from "lucide-react";
import { Support } from "../_components/support";

const metaTitle = "Blogs";
const metaDescription = "Latest changes , fixes and updates.";
const ogImage = "https://better-auth.com/release-og/changelog-og.png";

export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	if (!slug) {
		return <BlogPage />;
	}
	const page = blogs.getPage(slug);
	if (!page) {
		notFound();
	}
	const MDX = page.data?.body;
	const { title, description, date } = page.data;
	return (
		<div className="relative min-h-screen">
			<div className="pointer-events-none absolute inset-0 -z-10">
				<StarField className="top-1/3 left-1/2 -translate-x-1/2" />
				<Glow />
			</div>
			<div className="relative mx-auto max-w-3xl px-4 md:px-0 pb-24 pt-12">
				<h1 className="text-center text-3xl md:text-5xl font-semibold tracking-tighter">
					{title}
				</h1>
				{description && (
					<p className="mt-3 text-center text-muted-foreground">
						{description}
					</p>
				)}
				<div className="my-2 flex items-center justify-center gap-3">
					{page.data?.author?.avatar && (
						<Image
							src={page.data.author.avatar}
							alt={page.data?.author?.name ?? "Author"}
							width={40}
							height={40}
							className="rounded-full border"
						/>
					)}
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						{page.data?.author?.name && (
							<span className="font-medium text-foreground">
								{page.data.author.name}
							</span>
						)}
						{page.data?.author?.twitter && (
							<>
								<span>·</span>
								<a
									href={`https://x.com/${page.data.author.twitter}`}
									target="_blank"
									rel="noreferrer noopener"
									className="inline-flex items-center gap-1 underline decoration-dashed"
								>
									<XIcon className="size-3" />@{page.data.author.twitter}
								</a>
							</>
						)}
						{date && (
							<>
								<span>·</span>
								<time dateTime={String(date)}>{formatDate(date)}</time>
							</>
						)}
					</div>
				</div>
				<div className="w-full flex items-center gap-2 my-4 mb-8">
					<div className="flex items-center gap-2 opacity-80">
						<ArrowLeftIcon className="size-4" />
						<Link href="/blog" className="">
							Blogs
						</Link>
					</div>
					<hr className="h-1 w-full opacity-80" />
				</div>

				<article className="prose prose-neutral dark:prose-invert mx-auto max-w-3xl px-4 md:px-0">
					<MDX
						components={{
							...defaultMdxComponents,
							a: ({ className, href, children, ...props }: any) => {
								const isExternal =
									typeof href === "string" && /^(https?:)?\/\//.test(href);
								const classes = cn(
									"inline-flex items-center gap-1 font-medium underline decoration-dashed",
									className,
								);
								if (isExternal) {
									return (
										<a
											className={classes}
											href={href}
											target="_blank"
											rel="noreferrer noopener"
											{...props}
										>
											{children}
											<ExternalLink className="ms-0.5 inline size-[0.9em] text-fd-muted-foreground" />
										</a>
									);
								}
								return (
									<Link className={classes} href={href} {...(props as any)}>
										{children}
									</Link>
								);
							},
							Link: ({ className, href, children, ...props }: any) => {
								const isExternal =
									typeof href === "string" && /^(https?:)?\/\//.test(href);
								const classes = cn(
									"inline-flex items-center gap-1 font-medium underline decoration-dashed",
									className,
								);
								if (isExternal) {
									return (
										<a
											className={classes}
											href={href}
											target="_blank"
											rel="noreferrer noopener"
											{...props}
										>
											{children}
											<ExternalLink className="ms-0.5 inline size-[0.9em] text-fd-muted-foreground" />
										</a>
									);
								}
								return (
									<Link className={classes} href={href} {...(props as any)}>
										{children}
									</Link>
								);
							},
							Step,
							Steps,
							File,
							Folder,
							Files,
							Tab,
							Tabs,
							Pre: Pre,
							GenerateSecret,
							AnimatePresence,
							TypeTable,
							Features,
							ForkButton,
							DatabaseTable,
							Accordion,
							Accordions,
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
							Support,
						}}
					/>
				</article>
			</div>
		</div>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	if (!slug) {
		return {
			metadataBase: new URL("https://better-auth.com/blogs"),
			title: metaTitle,
			description: metaDescription,
			openGraph: {
				title: metaTitle,
				description: metaDescription,
				images: [
					{
						url: ogImage,
					},
				],
				url: "https://better-auth.com/blogs",
			},
			twitter: {
				card: "summary_large_image",
				title: metaTitle,
				description: metaDescription,
				images: [ogImage],
			},
		};
	}
	const page = blogs.getPage(slug);
	if (page == null) notFound();
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const url = new URL(
		`${baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`}${
			page.data?.image
		}`,
	);
	const { title, description } = page.data;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: absoluteUrl(`blog/${slug.join("/")}`),
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

export function generateStaticParams() {
	return blogs.generateParams();
}
