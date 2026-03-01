import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogLeftPanel } from "@/components/blog/blog-left-panel";
import { groupTocItems } from "@/components/docs/group-toc-items";
import { StepperTOC } from "@/components/docs/stepper-toc";
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
	const posts = blogs
		.getPages()
		.filter((p) => !p.data.draft)
		.sort((a, b) => {
			return (
				new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
			);
		});

	return (
		<div className="flex flex-col lg:flex-row h-full min-h-dvh pt-14 lg:pt-0">
			<BlogLeftPanel postCount={posts.length} />

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
												{post.data.tags.slice(0, 3).map((tag: string) => (
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
	if (!page || page.data.draft) {
		notFound();
	}

	const MDX = page.data?.body;
	const { title, description, date } = page.data;
	const toc = page.data.toc ?? [];
	const groupedToc = groupTocItems(toc);

	return (
		<div className="flex flex-col lg:flex-row h-full min-h-dvh pt-14 lg:pt-0">
			<BlogLeftPanel />

			{/* Right panel — blog content */}
			<div className="w-full lg:w-[70%] flex flex-col">
				<div className="relative px-5 sm:px-6 lg:px-8 pb-24 pt-8 lg:pt-16">
					{/* Horizontal TOC */}
					{groupedToc.length > 0 && <StepperTOC items={groupedToc} />}

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
			title: "Blog - Better Auth",
			description: "Latest updates, articles, and insights about Better Auth",
		};
	}
	const page = blogs.getPage(slug);
	if (!page || page.data.draft) return notFound();
	const { title, description } = page.data;
	return { title, description };
}

export function generateStaticParams() {
	return blogs
		.getPages()
		.filter((p) => !p.data.draft)
		.map((p) => ({ slug: p.slugs }));
}
