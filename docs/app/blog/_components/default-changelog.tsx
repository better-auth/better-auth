import { betterFetch } from "@better-fetch/fetch";
import { DiscordLogoIcon } from "@radix-ui/react-icons";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Link from "next/link";
import { useId } from "react";
import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";
import { IconLink } from "./changelog-layout";
import { BookIcon, GitHubIcon, XIcon } from "./icons";
import { StarField } from "./stat-field";

export const dynamic = "force-static";
const ChangelogPage = async () => {
	const { data: releases } = await betterFetch<
		{
			id: number;
			tag_name: string;
			name: string;
			body: string;
			html_url: string;
			prerelease: boolean;
			published_at: string;
		}[]
	>("https://api.github.com/repos/better-auth/better-auth/releases");

	const messages = releases
		?.filter((release) => !release.prerelease)
		.map((release) => ({
			tag: release.tag_name,
			title: release.name,
			content: getContent(release.body),
			date: new Date(release.published_at).toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
			}),
			url: release.html_url,
		}));

	function getContent(content: string) {
		const lines = content.split("\n");
		const newContext = lines.map((line) => {
			if (line.startsWith("- ")) {
				const mainContent = line.split(";")[0];
				const context = line.split(";")[2];
				const mentionMatches =
					(context ?? line)?.match(/@([A-Za-z0-9-]+)/g) ?? [];
				if (mentionMatches.length === 0) {
					return (mainContent || line).replace(/&nbsp/g, "");
				}
				const mentions = mentionMatches.map((match) => {
					const username = match.slice(1);
					const avatarUrl = `https://github.com/${username}.png`;
					return `[![${match}](${avatarUrl})](https://github.com/${username})`;
				});
				// Remove &nbsp
				return (
					(mainContent || line).replace(/&nbsp/g, "") +
					" – " +
					mentions.join(" ")
				);
			}
			return line;
		});
		return newContext.join("\n");
	}

	return (
		<div className="grid md:grid-cols-2 items-start">
			<div className="bg-gradient-to-tr overflow-hidden px-12 py-24 md:py-0 -mt-[100px] md:h-dvh relative md:sticky top-0 from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
				<StarField className="top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" />
				<Glow />

				<div className="flex flex-col md:justify-center max-w-xl mx-auto h-full">
					<h1 className="mt-14 font-sans font-semibold tracking-tighter text-5xl">
						All of the changes made will be{" "}
						<span className="">available here.</span>
					</h1>
					<p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
						Better Auth is the most comprehensive authentication framework for
						TypeScript that provides a wide range of features to make
						authentication easier and more secure.
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
			<div className="px-4 relative md:px-8 pb-12 md:py-12">
				<div className="absolute top-0 left-0 mb-2 w-2 h-full -translate-x-full bg-gradient-to-b from-black/10 dark:from-white/20 from-50% to-50% to-transparent bg-[length:100%_5px] bg-repeat-y"></div>

				<div className="max-w-2xl relative">
					<Markdown
						rehypePlugins={[[rehypeHighlight]]}
						components={{
							pre: (props) => (
								<defaultMdxComponents.pre
									{...props}
									className={cn(props.className, " ml-10 my-2")}
								/>
							),
							h2: (props) => (
								<h2
									id={props.children?.toString().split("date=")[0].trim()} // Extract ID dynamically
									className="text-2xl relative mb-6 font-bold flex-col flex justify-center tracking-tighter before:content-[''] before:block before:h-[65px] before:-mt-[10px]"
									{...props}
								>
									<div className="sticky top-0 left-[-9.9rem] hidden md:block">
										<time className="flex gap-2 items-center text-gray-500 dark:text-white/80 text-sm md:absolute md:left-[-9.8rem] font-normal tracking-normal">
											{props.children?.toString().includes("date=") &&
												props.children?.toString().split("date=")[1]}

											<div className="w-4 h-[1px] dark:bg-white/60 bg-black" />
										</time>
									</div>
									<Link
										href={
											props.children
												?.toString()
												.split("date=")[0]
												.trim()
												.endsWith(".00")
												? `/changelogs/${props.children
														?.toString()
														.split("date=")[0]
														.trim()}`
												: `#${props.children
														?.toString()
														.split("date=")[0]
														.trim()}`
										}
									>
										{props.children?.toString().split("date=")[0].trim()}
									</Link>
									<p className="text-xs font-normal opacity-60 hidden">
										{props.children?.toString().includes("date=") &&
											props.children?.toString().split("date=")[1]}
									</p>
								</h2>
							),
							h3: (props) => (
								<h3 className="text-xl tracking-tighter py-1" {...props}>
									{props.children?.toString()?.trim()}
									<hr className="h-[1px] my-1 mb-2 bg-input" />
								</h3>
							),
							p: (props) => <p className="my-0 ml-10 text-sm" {...props} />,
							ul: (props) => (
								<ul
									className="list-disc ml-10 text-[0.855rem] text-gray-600 dark:text-gray-300"
									{...props}
								/>
							),
							li: (props) => <li className="my-1" {...props} />,
							a: ({ className, ...props }: any) => (
								<Link
									target="_blank"
									className={cn("font-medium underline", className)}
									{...props}
								/>
							),
							strong: (props) => (
								<strong className="font-semibold" {...props} />
							),
							img: (props) => (
								<img
									className="rounded-full w-6 h-6 border opacity-70 inline-block"
									{...props}
									style={{ maxWidth: "100%" }}
								/>
							),
						}}
					>
						{messages
							?.map((message) => {
								return `
## ${message.title} date=${message.date}

${message.content}
								`;
							})
							.join("\n")}
					</Markdown>
				</div>
			</div>
		</div>
	);
};

export default ChangelogPage;

export function Glow() {
	let id = useId();

	return (
		<div className="absolute inset-0 -z-10 overflow-hidden bg-gradient-to-tr from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
			<svg
				className="absolute -bottom-48 left-[-40%] h-[80rem] w-[180%] lg:-right-40 lg:bottom-auto lg:left-auto lg:top-[-40%] lg:h-[180%] lg:w-[80rem]"
				aria-hidden="true"
			>
				<defs>
					<radialGradient id={`${id}-desktop`} cx="100%">
						<stop offset="0%" stopColor="rgba(41, 37, 36, 0.4)" />
						<stop offset="53.95%" stopColor="rgba(28, 25, 23, 0.09)" />
						<stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
					</radialGradient>
					<radialGradient id={`${id}-mobile`} cy="100%">
						<stop offset="0%" stopColor="rgba(41, 37, 36, 0.3)" />
						<stop offset="53.95%" stopColor="rgba(28, 25, 23, 0.09)" />
						<stop offset="100%" stopColor="rgba(0, 0, 0, 0)" />
					</radialGradient>
				</defs>
				<rect
					width="100%"
					height="100%"
					fill={`url(#${id}-desktop)`}
					className="hidden lg:block"
				/>
				<rect
					width="100%"
					height="100%"
					fill={`url(#${id}-mobile)`}
					className="lg:hidden"
				/>
			</svg>
			<div className="absolute inset-x-0 bottom-0 right-0 h-px dark:bg-white/5 mix-blend-overlay lg:left-auto lg:top-0 lg:h-auto lg:w-px" />
		</div>
	);
}
