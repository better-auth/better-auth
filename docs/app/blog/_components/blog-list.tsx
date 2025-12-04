import { DiscordLogoIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import Link from "next/link";
import { formatBlogDate } from "@/lib/blog";
import { blogs } from "@/lib/source";
import { IconLink } from "./changelog-layout";
import { Glow } from "./default-changelog";
import { BookIcon, GitHubIcon, XIcon } from "./icons";
import { StarField } from "./stat-field";

export async function BlogPage() {
	const posts = blogs.getPages().sort((a, b) => {
		return new Date(b.data.date).getTime() - new Date(a.data.date).getTime();
	});
	return (
		<div className="md:grid md:grid-cols-2 items-start">
			<div className="bg-gradient-to-tr hidden md:block overflow-hidden px-12 py-24 md:py-0 -mt-[100px] md:h-dvh relative md:sticky top-0 from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
				<StarField className="top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" />
				<Glow />

				<div className="flex flex-col md:justify-center max-w-xl mx-auto h-full">
					<h1 className="mt-14 font-sans font-semibold tracking-tighter text-5xl">
						Blogs
					</h1>

					<p className="text-sm text-gray-600 dark:text-gray-300">
						Latest updates, articles, and insights about Better Auth
					</p>
					<hr className="h-px bg-gray-300 mt-5" />
					<div className="mt-8 flex flex-wrap text-gray-600 dark:text-gray-300 gap-x-1 gap-y-3 sm:gap-x-2">
						<IconLink
							href="/docs"
							icon={BookIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							Documentation
						</IconLink>
						<IconLink
							href="https://github.com/better-auth/better-auth"
							icon={GitHubIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							GitHub
						</IconLink>
						<IconLink
							href="https://discord.gg/better-auth"
							icon={DiscordLogoIcon}
							className="flex-none text-gray-600 dark:text-gray-300"
						>
							Community
						</IconLink>
					</div>
					<p className="flex items-baseline absolute bottom-4 max-md:left-1/2 max-md:-translate-x-1/2 gap-x-2 text-[0.8125rem]/6 text-gray-500">
						<IconLink href="https://x.com/better_auth" icon={XIcon} compact>
							BETTER-AUTH.
						</IconLink>
					</p>
				</div>
			</div>
			<div className="py-6 lg:py-10 px-3">
				<div className="flex flex-col gap-2">
					{posts.map((post) => (
						<div
							className="group/blog flex flex-col gap-3 transition-colors p-4"
							key={post.slugs.join("/")}
						>
							<article className="group relative flex flex-col space-y-2 flex-3/4 py-1">
								<div className="flex gap-2">
									<div className="flex flex-col gap-2  border-b border-dashed pb-2">
										<p className="text-xs opacity-50">
											{formatBlogDate(post.data.date)}
										</p>
										<h2 className="text-2xl font-bold">{post.data?.title}</h2>
									</div>
								</div>
								{post.data?.image && (
									<Image
										src={post.data.image}
										alt={post.data.title}
										width={1206}
										height={756}
										className="rounded-md w-full bg-muted transition-colors"
									/>
								)}
								<div className="flex gap-2">
									<div className="flex flex-col gap-2  border-b border-dashed pb-2">
										<p className="text-muted-foreground">
											{post.data?.description.substring(0, 100)}...
										</p>
									</div>
								</div>
								<p className="text-xs opacity-50">
									{post.data.structuredData.contents[0].content.substring(
										0,
										250,
									)}
									...
								</p>
								<Link href={`/blog/${post.slugs.join("/")}`}>
									<p className="text-xs group-hover/blog:underline underline-offset-4 transition-all">
										Read More
									</p>
								</Link>
								<Link
									href={`/blog/${post.slugs.join("/")}`}
									className="absolute inset-0"
								>
									<span className="sr-only">View Article</span>
								</Link>
							</article>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
