import { v } from "@/app/source";
import { notFound } from "next/navigation";
import { absoluteUrl } from "@/lib/utils";
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
import VersionRelase from "./_compoents/version-release";
import { Pre } from "fumadocs-ui/components/codeblock";
export default async function Page({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const page = v.getPage(slug);
	if (!page) {
		notFound();
	}
	const MDX = page.data?.body;
	const toc = page.data?.toc;
	const { title, description, date } = page.data;
	let tocContent = toc.map((t) => {
		return {
			id: t.url,
			title: t.title.props?.children?.toString(),
		};
	});
	console.log({ tocContent });
	return (
		<VersionRelase
			title={title}
			description={description}
			date
			sections={tocContent}
		>
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
		</VersionRelase>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug?: string[] }>;
}) {
	const { slug } = await params;
	const page = v.getPage(slug);
	if (page == null) notFound();
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const url = new URL(`${baseUrl}/api/og`);
	const { title, description } = page.data;
	console.log({ title, description });
	const pageSlug = page.file.path;
	url.searchParams.set("type", "Version Release");
	url.searchParams.set("mode", "dark");
	url.searchParams.set("heading", `${title}`);

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
	const res = v.getPages().map((page) => ({
		slug: page.slugs,
	}));
	return v.generateParams();
}
