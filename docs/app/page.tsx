import Link from "next/link";
import Features from "@/components/features";
import Hero from "@/components/landing/hero";
import Section from "@/components/landing/section";

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

export default async function HomePage() {
	const stars = await getGitHubStars();
	return (
		<main className="h-min mx-auto overflow-x-hidden">
			<div className="w-full bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:via-black dark:to-zinc-950 border-b border-dashed border-zinc-200 dark:border-zinc-800">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="w-full h-full">
						<div className="flex flex-col md:flex-row items-center justify-center h-12">
							<span className="font-medium flex gap-2 text-sm text-zinc-700 dark:text-zinc-300">
								<span className="text-zinc-900 dark:text-white/90 hover:text-zinc-950 text-xs md:text-sm dark:hover:text-zinc-100 transition-colors">
									Introducing{" "}
									<span className="font-semibold">
										Better Auth Infrastructure
									</span>
								</span>
								<span className="text-zinc-400 hidden md:block">|</span>
								<Link
									href="https://better-auth.build"
									className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hidden dark:hover:text-blue-300 transition-colors md:block"
								>
									Join the waitlist →
								</Link>
							</span>
							<Link
								href="https://better-auth.build"
								className="font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 text-xs dark:hover:text-blue-300 transition-colors md:hidden"
							>
								Join the waitlist →
							</Link>
						</div>
					</div>
				</div>
			</div>
			<Section
				className="mb-1 overflow-y-clip"
				crosses
				crossesOffset="lg:translate-y-[5.25rem]"
				customPaddings
				id="hero"
			>
				<Hero />
				<Features stars={stars} />
				<hr className="h-px bg-border" />
			</Section>
		</main>
	);
}
