import Section from "@/components/landing/section";
import Hero from "@/components/landing/hero";
import Features from "@/components/features";
import Link from "next/link";
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
			<div className="w-full bg-gradient-to-br border-b dark:border-zinc-800 border-zinc-200 dark:from-zinc-950 dark:to-black from-zinc-150 to-zinc-100 dark:text-white text-center py-2">
				<p className="text-sm px-4 tracking-tight font-mono">
					Introducing{" "}
					<Link target="_blank" href="https://better-auth.build">
						Better Auth Infrastructure
					</Link>{" "}
					|{" "}
					<Link
						href="https://better-auth.build"
						className="underline underline-offset-2 text-blue-400 hover:text-blue-600"
					>
						Join the waitlist
					</Link>{" "}
				</p>
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
				<hr className="h-px bg-gray-200" />
			</Section>
		</main>
	);
}
