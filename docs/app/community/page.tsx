import { Metadata } from "next";
import CommunityHeader from "./_components/header";
import Stats from "./_components/stats";
import Section from "@/components/landing/section";

export const metadata: Metadata = {
	title: "Community",
	description:
		"Join the Better Auth community and connect with developers worldwide.",
};

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
			<div className="w-full min-h-screen bg-transparent">
				<div className="relative flex flex-col w-full overflow-hidden bg-transparent/10">
					<div className="h-[38vh]">
						<CommunityHeader />
					</div>
					<div className="relative py-0">
						<div className="absolute inset-0 z-0">
							<div className="grid h-full grid-cols-12">
								{Array(12)
									.fill(null)
									.map((_, i) => (
										<div
											key={i}
											className="h-full border-l border-dashed border-stone-100 dark:border-white/10"
										/>
									))}
							</div>
							<div className="absolute top-0 grid w-full grid-rows-12">
								{Array(12)
									.fill(null)
									.map((_, i) => (
										<div
											key={i}
											className="w-full border-t border-dashed border-stone-100 dark:border-stone-900/60"
										/>
									))}
							</div>
						</div>
					</div>
					<div className="w-full overflow-hidden md:mx-auto">
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
