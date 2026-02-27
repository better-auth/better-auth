import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogSidebar } from "@/components/blog/blog-sidebar";

import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { Callout } from "@/components/ui/callout";
import { blogs } from "@/lib/source";
import { cn } from "@/lib/utils";

function formatDate(date: Date) {
	return new Date(date).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

function BlogList() {
	const posts = blogs.getPages().sort((a, b) => {
		return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
	});

	return (
		<div className="flex flex-col lg:flex-row h-full min-h-dvh pt-14 lg:pt-0">
			{/* Left panel — fixed */}
			<div className="relative w-full lg:w-[30%] lg:h-dvh lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
				<HalftoneBackground />
				<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-dvh">
					<div className="space-y-4">
						<div className="space-y-1">
							<div className="flex items-center gap-1.5">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="0.9em"
									height="0.9em"
									viewBox="0 0 24 24"
									className="text-neutral-600 dark:text-neutral-100"
									aria-hidden="true"
								>
									<path
										fill="currentColor"
										d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
									/>
								</svg>
								<span className="text-sm text-neutral-600 dark:text-neutral-100">
									Blog
								</span>
							</div>
							<h1 className="text-lg md:text-xl lg:text-2xl xl:text-3xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
								News, releases, and insights
							</h1>
							<p className="text-[11px] text-foreground/40 leading-relaxed max-w-[240px] pt-1">
								Follow along as we build the most comprehensive authentication
								framework for the web.
							</p>
						</div>

						{/* Social & RSS */}
						<div className="flex items-center gap-3 pt-2">
							<a
								href="https://github.com/better-auth/better-auth"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-foreground/30 hover:text-foreground/70 transition-colors"
								aria-label="GitHub"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
									/>
								</svg>
							</a>
							<a
								href="https://x.com/better_auth"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-1.5 text-foreground/30 hover:text-foreground/70 transition-colors"
								aria-label="X (Twitter)"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="13"
									height="13"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
									/>
								</svg>
							</a>
							<a
								href="/rss.xml"
								className="flex items-center gap-1.5 text-foreground/30 hover:text-foreground/70 transition-colors"
								aria-label="RSS Feed"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="14"
									height="14"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93z"
									/>
								</svg>
							</a>
						</div>

						{/* Latest post count */}
						<div className="hidden lg:block border-t border-foreground/[0.06] pt-4">
							<div className="flex items-baseline justify-between">
								<span className="text-[11px] text-foreground/40 uppercase tracking-wider">
									Posts
								</span>
								<span className="text-[11px] text-foreground/70 font-mono">
									{posts.length}
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Right panel — post list */}
			<div className="w-full lg:w-[70%] flex flex-col">
				<div className="px-5 sm:px-6 lg:px-8 pt-8 lg:pt-16">
					<h2 className="text-[15px] font-mono text-neutral-800 dark:text-neutral-200 pb-3 mb-5 border-b border-foreground/[0.08]">
						BLOGS
					</h2>
				</div>

				<div className="flex flex-col">
					{posts.map((post) => (
						<Link
							key={post.slugs.join("/")}
							href={`/blog/${post.slugs.join("/")}`}
							className="group block border-b border-dashed border-foreground/[0.06] px-5 sm:px-6 lg:px-8 py-5 transition-colors hover:bg-foreground/[0.02]"
						>
							<div className="flex gap-5 items-start">
								{post.data?.image && (
									<div className="shrink-0 w-40 h-24 overflow-hidden border border-foreground/[0.06] hidden sm:block">
										<Image
											src={post.data.image}
											alt={post.data.title}
											width={320}
											height={192}
											className="w-full h-full object-cover"
										/>
									</div>
								)}
								<div className="flex-1 min-w-0">
									<h2 className="text-sm font-medium tracking-tight text-neutral-800 dark:text-neutral-200 group-hover:text-neutral-950 dark:group-hover:text-white transition-colors">
										{post.data.title}
									</h2>
									{post.data.description && (
										<p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1">
											{post.data.description}
										</p>
									)}
									<div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-neutral-400 dark:text-neutral-500">
										{post.data.author?.name && (
											<>
												<span className="text-neutral-500 dark:text-neutral-400">
													{post.data.author.name}
												</span>
												<span>&middot;</span>
											</>
										)}
										<span>{formatDate(post.data.date)}</span>
										{post.data.tags && post.data.tags.length > 0 && (
											<>
												<span>&middot;</span>
												{post.data.tags.slice(0, 3).map((tag) => (
													<span
														key={tag}
														className="text-neutral-400 dark:text-neutral-600"
													>
														#{tag}
													</span>
												))}
											</>
										)}
									</div>
								</div>
								<span className="shrink-0 text-[11px] font-mono text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-400 transition-colors self-center">
									&rarr;
								</span>
							</div>
						</Link>
					))}
				</div>
				<div className="h-16" />
			</div>
		</div>
	);
}

export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	if (!slug) {
		return <BlogList />;
	}

	const page = blogs.getPage(slug);
	if (!page) {
		notFound();
	}

	const MDX = page.data?.body;
	const { title, description, date } = page.data;
	const toc = page.data.toc ?? [];

	return (
		<>
			<BlogSidebar toc={toc} />
			<div className="blog-layout relative min-h-screen">
				<div className="relative max-w-3xl px-6 lg:px-10 pb-24 pt-8">
					{/* Header */}
					<h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-neutral-800 dark:text-neutral-200">
						{title}
					</h1>
					{description && (
						<p className="mt-2 text-neutral-500 dark:text-neutral-400">
							{description}
						</p>
					)}

					{/* Author & date */}
					<div className="mt-4 mb-8 flex items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
						{page.data?.author?.name && (
							<span className="font-medium text-neutral-700 dark:text-neutral-300">
								{page.data.author.name}
							</span>
						)}
						{page.data?.author?.twitter && (
							<>
								<span>&middot;</span>
								<a
									href={`https://x.com/${page.data.author.twitter}`}
									target="_blank"
									rel="noreferrer noopener"
									className="text-xs font-mono hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
								>
									@{page.data.author.twitter}
								</a>
							</>
						)}
						{date && (
							<>
								<span>&middot;</span>
								<time
									dateTime={String(date)}
									className="text-xs font-mono text-neutral-400 dark:text-neutral-500"
								>
									{formatDate(date)}
								</time>
							</>
						)}
					</div>

					<div className="border-t border-dashed border-foreground/10 mb-8" />

					{/* Article body */}
					<article className="prose prose-neutral dark:prose-invert max-w-3xl prose-headings:tracking-tight prose-a:decoration-dashed prose-a:underline-offset-4 prose-pre:rounded-none prose-pre:border prose-pre:border-foreground/10 prose-img:rounded-none">
						<MDX
							components={{
								...defaultMdxComponents,
								Step,
								Steps,
								Tab,
								Tabs,
								Accordion,
								Accordions,
								Callout: ({
									children,
									type,
									...props
								}: {
									children: React.ReactNode;
									type?:
										| "info"
										| "warn"
										| "error"
										| "success"
										| "warning"
										| "none";
									[key: string]: any;
								}) => (
									<Callout type={type === "none" ? undefined : type} {...props}>
										{children}
									</Callout>
								),
								Contributors: ({ usernames }: { usernames: string[] }) => (
									<div className="flex flex-wrap gap-1.5 not-prose">
										{usernames.map((username) => (
											<a
												key={username}
												href={`https://github.com/${username}`}
												target="_blank"
												rel="noreferrer noopener"
												className="text-xs font-mono px-2 py-1 border border-foreground/10 text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:border-foreground/20 transition-colors"
											>
												@{username}
											</a>
										))}
									</div>
								),
								a: ({ className, href, children, ...props }: any) => {
									const isExternal =
										typeof href === "string" && /^(https?:)?\/\//.test(href);
									const classes = cn(
										"font-medium underline decoration-dashed underline-offset-4",
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
											</a>
										);
									}
									return (
										<Link className={classes} href={href} {...(props as any)}>
											{children}
										</Link>
									);
								},
							}}
						/>
					</article>
				</div>
			</div>
		</>
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
			title: "Blog - Better Auth",
			description: "Latest updates, articles, and insights about Better Auth",
		};
	}
	const page = blogs.getPage(slug);
	if (!page) return notFound();
	const { title, description } = page.data;
	return { title, description };
}

export function generateStaticParams() {
	return blogs.generateParams();
}
