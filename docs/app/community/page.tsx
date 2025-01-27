import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconLink } from "../changelogs/_components/changelog-layout";
import { GitHubIcon, XIcon } from "../changelogs/_components/icons";

export default function CommunityPage() {
	return (
		<div className="container mx-auto px-16 py-16 space-y-12 flex justify-center flex-col min-h-[90vh]">
			<div>
				<div className="my-4">
					<h1 className="text-3xl font-bold text-center">Join The Community</h1>
					<p className="text-center dark:text-white/70">
						join the community to get help, share ideas, and stay up-to-date
						with
					</p>
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2	 gap-8">
					<Card className="rounded-none  dark:bg-gradient-to-tr dark:from-zinc-950 dark:to-black/60 border dark:border-stone-900">
						<CardContent className="flex flex-col items-center p-6">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="2.4em"
								height="2.4em"
								viewBox="0 0 24 24"
								className="my-2"
							>
								<path
									fill="currentColor"
									d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.1.1 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.1 16.1 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09c-.01-.02-.04-.03-.07-.03c-1.5.26-2.93.71-4.27 1.33c-.01 0-.02.01-.03.02c-2.72 4.07-3.47 8.03-3.1 11.95c0 .02.01.04.03.05c1.8 1.32 3.53 2.12 5.24 2.65c.03.01.06 0 .07-.02c.4-.55.76-1.13 1.07-1.74c.02-.04 0-.08-.04-.09c-.57-.22-1.11-.48-1.64-.78c-.04-.02-.04-.08-.01-.11c.11-.08.22-.17.33-.25c.02-.02.05-.02.07-.01c3.44 1.57 7.15 1.57 10.55 0c.02-.01.05-.01.07.01c.11.09.22.17.33.26c.04.03.04.09-.01.11c-.52.31-1.07.56-1.64.78c-.04.01-.05.06-.04.09c.32.61.68 1.19 1.07 1.74c.03.01.06.02.09.01c1.72-.53 3.45-1.33 5.25-2.65c.02-.01.03-.03.03-.05c.44-4.53-.73-8.46-3.1-11.95c-.01-.01-.02-.02-.04-.02M8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.84 2.12-1.89 2.12m6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12c0 1.17-.83 2.12-1.89 2.12"
								></path>
							</svg>
							<h2 className="text-2xl font-semibold mb-2">Discord</h2>
							<p className="text-center mb-4">
								Chat in real-time, collaborate, and connect with other members.
							</p>
							<Link
								href="https://discord.gg/GYC3W7tZzb"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Button variant="outline">Join our Discord</Button>
							</Link>
						</CardContent>
					</Card>

					<Card className="transition-colors rounded-none">
						<CardContent className="flex flex-col items-center p-6">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="2.4em"
								height="2.4em"
								viewBox="0 0 24 24"
								className="my-2"
							>
								<path
									fill="currentColor"
									d="M10.75 13.04c0-.57-.47-1.04-1.04-1.04s-1.04.47-1.04 1.04a1.04 1.04 0 1 0 2.08 0m3.34 2.37c-.45.45-1.41.61-2.09.61s-1.64-.16-2.09-.61a.26.26 0 0 0-.38 0a.26.26 0 0 0 0 .38c.71.71 2.07.77 2.47.77s1.76-.06 2.47-.77a.26.26 0 0 0 0-.38c-.1-.1-.27-.1-.38 0m.2-3.41c-.57 0-1.04.47-1.04 1.04s.47 1.04 1.04 1.04s1.04-.47 1.04-1.04S14.87 12 14.29 12"
								></path>
								<path
									fill="currentColor"
									d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10s10-4.48 10-10S17.52 2 12 2m5.8 11.33c.02.14.03.29.03.44c0 2.24-2.61 4.06-5.83 4.06s-5.83-1.82-5.83-4.06c0-.15.01-.3.03-.44c-.51-.23-.86-.74-.86-1.33a1.455 1.455 0 0 1 2.47-1.05c1.01-.73 2.41-1.19 3.96-1.24l.74-3.49c.01-.07.05-.13.11-.16c.06-.04.13-.05.2-.04l2.42.52a1.04 1.04 0 1 1 .93 1.5c-.56 0-1.01-.44-1.04-.99l-2.17-.46l-.66 3.12c1.53.05 2.9.52 3.9 1.24a1.455 1.455 0 1 1 1.6 2.38"
								></path>
							</svg>
							<h2 className="text-2xl font-semibold mb-2">Reddit</h2>
							<p className="text-center mb-4">
								Join discussions, share ideas, and get help from the community.
							</p>
							<Link
								href="https://www.reddit.com/r/better_auth"
								target="_blank"
								rel="noopener noreferrer"
							>
								<Button variant="outline">Join Subreddit</Button>
							</Link>
						</CardContent>
					</Card>
				</div>
			</div>

			<div className="mt-auto">
				<div className="max-w-2xl mx-auto text-center">
					<p className="text-lg mb-6">
						Thanks for being a part of the community!
					</p>
				</div>

				<div className="flex justify-center space-x-6">
					<IconLink
						href="https://x.com/better_auth"
						icon={XIcon}
						className="flex-none text-gray-600 dark:text-gray-300"
					>
						X (formerly Twitter)
					</IconLink>
					<IconLink
						href="https://github.com/better-auth/better-auth"
						icon={GitHubIcon}
						className="flex-none text-gray-600 dark:text-gray-300"
					>
						GitHub
					</IconLink>
				</div>
			</div>
		</div>
	);
}
