import CommunityHeader from "./_components/header";
import Stats from "./_components/stats";
import Section from "@/components/landing/section";
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
		if (!response?.ok) {
			return null;
		}
		const json = await response.json();
		const stars = parseInt(json.stargazers_count).toLocaleString();
		return stars;
	} catch {
		return null;
	}
}
export default async function CommunityPage() {
	const npmDownloads = await getNPMPackageDownloads();
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
					<div className="h-[45vh]">
						<CommunityHeader />
					</div>
					<div className="relative py-0">
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
					</div>
					<div className="w-full md:mx-auto overflow-hidden">
						<Stats npmDownloads={npmDownloads.downloads} />
					</div>
				</div>
			</div>
		</Section>
	);
}
