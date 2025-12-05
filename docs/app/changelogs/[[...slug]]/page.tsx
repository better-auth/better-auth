import { Accordion, Accordions } from "fumadocs-ui/components/accordion";
import { Pre } from "fumadocs-ui/components/codeblock";
import { File, Files, Folder } from "fumadocs-ui/components/files";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import { TypeTable } from "fumadocs-ui/components/type-table";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Features } from "@/components/blocks/features";
import { ForkButton } from "@/components/fork-button";
import { GenerateSecret } from "@/components/generate-secret";
import DatabaseTable from "@/components/mdx/database-tables";
import { Callout } from "@/components/ui/callout";
import { AnimatePresence } from "@/components/ui/fade-in";
import { changelogs } from "@/lib/source";
import { absoluteUrl, cn, formatDate } from "@/lib/utils";
import { IconLink } from "../_components/changelog-layout";
import ChangelogPage, { Glow } from "../_components/default-changelog";
import { GridPatterns } from "../_components/grid-pattern";
import { XIcon } from "../_components/icons";
import { StarField } from "../_components/stat-field";

const metaTitle = "Changelogs";
const metaDescription = "Latest changes , fixes and updates.";

export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const page = changelogs.getPage(slug);
	if (!slug) {
		return <ChangelogPage />;
	}
	if (!page) {
		notFound();
	}
	const MDX = page.data?.body;
	const toc = page.data?.toc;
	const { title, description, date } = page.data;
	return (
		<div className="md:grid md:grid-cols-2 items-start">
			<div className="bg-gradient-to-tr hidden md:block overflow-hidden px-12 py-24 md:py-0 -mt-[100px] md:h-dvh relative md:sticky top-0 from-transparent dark:via-stone-950/5 via-stone-100/30 to-stone-200/20 dark:to-transparent/10">
				<StarField className="top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2" />
				<Glow />
				<GridPatterns />
				<div className="z-20 flex flex-col md:justify-center max-w-xl mx-auto h-full">
					<div className="mt-14 mb-2 text-gray-600 dark:text-gray-300 flex items-center gap-x-1">
						<p className="text-[12px] uppercase font-mono">
							{formatDate(date)}
						</p>
					</div>
					<h1 className="font-sans mb-2 font-semibold tracking-tighter text-5xl">
						{title}{" "}
					</h1>
					<p className="text-sm text-gray-600 mb-2 dark:text-gray-300">
						{description}
					</p>
					<hr className="mt-4" />
					<p className="absolute bottom-10 text-[0.8125rem]/6 text-gray-500">
						<IconLink href="https://x.com/better_auth" icon={XIcon} compact>
							BETTER-AUTH.
						</IconLink>
					</p>
				</div>
			</div>
			<div className="px-4 relative md:px-8 pb-12 md:py-12">
				<div className="absolute top-0 left-0 h-full -translate-x-full w-px bg-gradient-to-b from-black/5 dark:from-white/10 via-black/3 dark:via-white/5 to-transparent"></div>
				<div className="prose pt-8 md:pt-0">
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
						}}
					/>
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
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const ogImage = `${baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`}/release-og/changelogs.png`;

	if (!slug) {
		return {
			metadataBase: new URL(
				`${baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`}/changelogs`,
			),
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
				url: `${baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`}/changelogs`,
			},
			twitter: {
				card: "summary_large_image",
				title: metaTitle,
				description: metaDescription,
				images: [ogImage],
			},
		};
	}
	const page = changelogs.getPage(slug);
	if (page == null) notFound();
	const url = new URL(`${baseUrl}/release-og/${slug.join("")}.png`);
	const { title, description } = page.data;

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
			url: absoluteUrl(`changelogs/${slug.join("")}`),
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
