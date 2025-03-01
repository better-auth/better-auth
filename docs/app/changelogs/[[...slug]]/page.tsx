import { changelogs } from "@/app/source";
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
import { DocsBody } from "fumadocs-ui/page";
import ChangelogPage, { Glow } from "../_components/default-changelog";
import { IconLink } from "../_components/changelog-layout";
import { BookIcon, GitHubIcon, XIcon } from "../_components/icons";
import { DiscordLogoIcon } from "@radix-ui/react-icons";
import { StarField } from "../_components/stat-field";
import { CalendarClockIcon } from "lucide-react";

export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const page = changelogs.getPage(slug);
	if (!slug) {
		//@ts-ignore
		return <ChangelogPage />;
	}
	if (!page) {
		notFound();
	}
	const MDX = page.data?.body;
	const toc = page.data?.toc;
	const { title, description, date } = page.data;
	return (
		<div className="grid md:grid-cols-2 items-start">
			<div className="bg-gradient-to-tr overflow-hidden px-12 py-24 md:py-0 -mt-[100px] md:h-dvh relative md:sticky top-0 from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
				<StarField className="top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" />
				<Glow />

				<div className="flex flex-col md:justify-center max-w-xl mx-auto h-full">
					<h1 className="mt-14 font-sans font-semibold tracking-tighter text-5xl">
						{title}{" "}
					</h1>

					<p className="text-sm text-gray-600 dark:text-gray-300">
						{description}
					</p>
					<div className="text-gray-600 dark:text-gray-300 flex items-center gap-x-1">
						<CalendarClockIcon className="w-4 h-4" />
						<p>{formatDate(date)}</p>
					</div>
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
							href="https://discord.gg/GYC3W7tZzb"
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
				<div className="absolute top-0 left-0 h-full -translate-x-full w-px bg-gradient-to-b from-black/5 dark:from-white/10 via-black/3 dark:via-white/5 to-transparent"></div>
				<Link
					href="/changelogs"
					className="mb-6 inline-flex items-center text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="mr-2"
					>
						<path d="m15 18-6-6 6-6" />
					</svg>
					Back to Changelogs
				</Link>
				<DocsBody>
					<MDX
						components={{
							...defaultMdxComponents,
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
							Pre: Pre,
							GenerateSecret,
							AnimatePresence,
							TypeTable,
							Features,
							ForkButton,
							DatabaseTable,
							Accordion,
							Accordions,
						}}
					/>
				</DocsBody>
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
			title: "Changelogs",
			description: "Changelogs",
		};
	}
	const page = changelogs.getPage(slug);
	if (page == null) notFound();
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const url = new URL(`${baseUrl}/api/og-release`);
	const { title, description, date } = page.data;
	const dateString = formatDate(date);
	const pageSlug = page.file.path;
	url.searchParams.set("type", "Version Release");
	url.searchParams.set("mode", "dark");
	url.searchParams.set("heading", `${title}`);
	url.searchParams.set("description", `${description}`);
	url.searchParams.set("date", `${dateString}`);

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: absoluteUrl(`v/${pageSlug}`),
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
	return changelogs.generateParams();
}

const Icon = ({ className, ...rest }: any) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
			width={24}
			height={30}
			strokeWidth="1"
			stroke="currentColor"
			{...rest}
			className={cn(
				"dark:text-white/50 text-black/50 size-6 absolute",
				className,
			)}
		>
			<path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
		</svg>
	);
};
