import type { Metadata } from "next";
import Section from "@/components/landing/section";
import CommunityHeader from "./_components/header";
import Stats from "./_components/stats";

export async function generateMetadata(): Promise<Metadata> {
	const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.VERCEL_URL;
	const ogImage = `${
		baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`
	}/release-og/community.png`;

	return {
		title: "Community | Better Auth",
		description:
			"Join better-auth community to get help, share ideas, and stay up to date.",
		openGraph: {
			title: "Community | Better Auth",
			description:
				"Join better-auth community to get help, share ideas, and stay up to date.",
			images: [
				{
					url: ogImage,
					width: 1200,
					height: 630,
					alt: "Better Auth Community",
				},
			],
			url: `${
				baseUrl?.startsWith("http") ? baseUrl : `https://${baseUrl}`
			}/community`,
		},
		twitter: {
			card: "summary_large_image",
			title: "Community | Better Auth",
			description:
				"Join better-auth community to get help, share ideas, and stay up to date.",
			images: [ogImage],
		},
	};
}

type NpmPackageResp = {
	downloads: number;
	start: string;
	end: string;
	package: string;
};
async function getNPMPackageDownloads() {
	const res = await fetch(
		`https://api.npmjs.org/downloads/point/last-year/better-auth`,
		{
			next: { revalidate: 60 },
		},
	);

	const npmStat: NpmPackageResp = await res.json();
	return npmStat;
}
async function getGitHubStars() {
	try {
		const response = await fetch(
			"https://api.github.com/repos/better-auth/better-auth",
			{
				next: {
					revalidate: 60,
				},
			},
		);
		const json = await response.json();
		const stars = Number(json.stargazers_count);
		return stars;
	} catch {
		return 0;
	}
}
export default async function CommunityPage() {
	const npmDownloads = await getNPMPackageDownloads();
	const githubStars = await getGitHubStars();

	return (
		<Section
			id="hero"
			className="relative md:px-[3.4rem] md:pl-[3.9rem] md:max-w-7xl md:mx-auto overflow-hidden"
			crosses={false}
			crossesOffset=""
			customPaddings
		>
			<div className="min-h-screen w-full bg-transparent">
				<div className="overflow-hidden flex flex-col w-full bg-transparent/10 relative">
					<div className="h-[38vh]">
						<CommunityHeader />
					</div>
					{/* <div className="relative py-0">
						<div className="absolute inset-0 z-0">
							<div className="grid grid-cols-12 h-full">
								{Array(12)
									.fill(null)
									.map((_, i) => (
										<div
											key={i}
											className="border-l border-dashed border-stone-100 dark:border-white/10 h-full"
										/>
									))}
							</div>
							<div className="grid grid-rows-12 w-full absolute top-0">
								{Array(12)
									.fill(null)
									.map((_, i) => (
										<div
											key={i}
											className="border-t border-dashed border-stone-100 dark:border-stone-900/60 w-full"
										/>
									))}
							</div>
						</div>
					</div> */}
					<div className="w-full md:mx-auto overflow-hidden">
						<Stats
							npmDownloads={npmDownloads.downloads}
							githubStars={githubStars}
						/>
					</div>
				</div>
			</div>
		</Section>
	);
}
