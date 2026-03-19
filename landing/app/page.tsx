import Image from "next/image";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { HeroReadMe } from "@/components/landing/hero-readme";
import { HeroTitle } from "@/components/landing/hero-title";
import { getCommunityStats, getContributors } from "@/lib/community-stats";

export default async function HomePage() {
	const contributors = getContributors();
	const communityStats = await getCommunityStats();

	return (
		<div id="hero" className="relative pt-[45px] lg:pt-0">
			<div className="relative text-foreground" data-v="1">
				<div className="flex flex-col lg:flex-row">
					{/* Left side — Hero title */}
					<div className="relative w-full lg:w-[40%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] px-5 sm:px-6 lg:px-7 lg:sticky lg:top-0 z-10 bg-background lg:overflow-clip">
						<HalftoneBackground />
						{/* 3D Logo */}
						<div className="hidden lg:flex justify-center h-full absolute items-center left-1/2 -translate-x-1/2 w-full pointer-events-auto select-none animate-logo-reveal z-[1]">
							{/* Dark mode logos */}
							<div className="group max-w-[300px] w-full max-h-[200px] -mt-[30%] hidden dark:flex justify-center opacity-60">
								<Image
									src="https://docs.better-auth.com/left-3d-logo.svg"
									alt=""
									width={518}
									height={667}
									className="h-auto max-h-[200px] z-10 animate-logo-snap-left transition-transform duration-300 ease-out group-hover:-translate-x-3 group-hover:-rotate-5"
									priority
									draggable={false}
								/>
								<Image
									src="https://docs.better-auth.com/right-3d-logo.svg"
									alt=""
									width={518}
									height={667}
									className="h-auto -ml-28 -mt-3 max-h-[200px] animate-logo-snap-right transition-transform duration-300 ease-out group-hover:translate-x-3 group-hover:rotate-5"
									priority
									draggable={false}
								/>
							</div>
							{/* Light mode logos */}
							<div className="group max-w-[300px] w-full max-h-[200px] -mt-[30%] flex dark:hidden justify-center opacity-60">
								<Image
									src="https://docs.better-auth.com/left-3d-logo-light.svg"
									alt=""
									width={518}
									height={667}
									className="h-auto max-h-[200px] z-10 animate-logo-snap-left transition-transform duration-300 ease-out group-hover:-translate-x-3 group-hover:-rotate-5"
									priority
									draggable={false}
								/>
								<Image
									src="https://docs.better-auth.com/right-3d-logo-light.svg"
									alt=""
									width={518}
									height={667}
									className="h-auto -ml-28 -mt-3 max-h-[200px] animate-logo-snap-right transition-transform duration-300 ease-out group-hover:translate-x-3 group-hover:rotate-5"
									priority
									draggable={false}
								/>
							</div>
						</div>
						<HeroTitle />
					</div>

					{/* Right side — Sign in */}
					<div className="relative z-0 w-full lg:w-[60%] overflow-hidden">
						<div className="flex items-start lg:items-center justify-center">
							<HeroReadMe
								contributors={contributors}
								stats={{
									npmDownloads: communityStats.npmDownloads,
									githubStars: communityStats.githubStars,
								}}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
