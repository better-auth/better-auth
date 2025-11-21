import { DiscordLogoIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BackgroundLines } from "./bg-line";

export const metadata: Metadata = {
	title: "V1.0 Release",
	description: "Better Auth V1.0 release notes",
	openGraph: {
		images: "https://better-auth.com/v1-og.png",
		title: "V1.0 Release",
		description: "Better Auth V1.0 release notes",
		url: "https://better-auth.com/v1",
		type: "article",
		siteName: "Better Auth",
	},
	twitter: {
		images: "https://better-auth.com/v1-og.png",
		card: "summary_large_image",
		site: "@better_auth",
		creator: "@better_auth",
		title: "V1.0 Release",
		description: "Better Auth V1.0 release notes",
	},
};

export default function V1Ship() {
	return (
		<div className="min-h-screen bg-transparent overflow-hidden">
			<div className="h-[50vh] bg-transparent/10 relative">
				<BackgroundLines>
					<div className="absolute bottom-1/3 left-1/2 transform -translate-x-1/2 text-center">
						<h1 className="text-5xl mb-4">V1.0 - nov.22</h1>
						<p className="text-lg text-gray-400 max-w-xl mx-auto">
							We are excited to announce the Better Auth V1.0 release.
						</p>
					</div>
				</BackgroundLines>
			</div>

			<div className="relative py-24">
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
				<div className="max-w-6xl mx-auto px-6 relative z-10">
					<h2 className="text-3xl font-bold mb-12 font-geist text-center">
						What does V1 means?
					</h2>
					<p>
						Since introducing Better Auth, the community's excitement has been
						incredibly motivating—thank you! <br /> <br />
						V1 is an important milestone, but it simply means we believe you can
						use it in production and that we'll strive to keep the APIs stable
						until the next major version. However, we'll continue improving,
						adding new features, and fixing bugs at the same pace as before.
						<br /> <br />
						If you were using Better Auth for production, we recommend updating
						to V1 as soon as possible. There are some breaking changes, feel
						free to join us on{" "}
						<Link href="https://discord.gg/better-auth">Discord</Link>, and
						we'll gladly assist.
					</p>
				</div>
			</div>

			<ReleaseRelated />

			<div className="border-t border-white/10">
				<div className="max-w-4xl mx-auto px-6 py-24">
					<h2 className="text-3xl font-bold mb-12 font-geist">Changelog</h2>
					<div className="space-y-8">
						<ChangelogItem
							version="1.0.0"
							date="2024"
							changes={[
								"feat: Open API Docs",
								"docs: Sign In Box Builder",
								"feat: default memory adapter. If no database is provided, it will use memory adapter",
								"feat: New server only endpoints for Organization and Two Factor plugins",
								"refactor: all core tables now have `createdAt` and `updatedAt` fields",
								"refactor: accounts now store `expiresAt` for both refresh and access tokens",
								"feat: Email OTP forget password flow",
								"docs: NextAuth.js migration guide",
								"feat: sensitive endpoints now check for fresh tokens",
								"feat: two-factor now have different interface for redirect and callback",
								"and a lot more bug fixes and improvements...",
							]}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function ReleaseRelated() {
	return (
		<div className="relative dark:bg-transparent/10 bg-zinc-100 border-b-2 border-white/10 rounded-none py-24">
			<div className="absolute inset-0 z-0">
				<div className="grid grid-rows-12 w-full absolute top-0">
					{Array(12)
						.fill(null)
						.map((_, i) => (
							<div
								key={i}
								className="border-t border-dashed border-white/10 w-full"
							/>
						))}
				</div>
			</div>
			<div className="max-w-6xl mx-auto px-6 relative z-10">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					<div>
						<h3 className="text-xl font-semibold mb-4">Install Latest</h3>
						<div className="dark:bg-white/5 bg-black/10 rounded-lg p-4 mb-2">
							<code className="text-sm font-mono">
								npm i better-auth@latest
							</code>
						</div>
						<p className="text-sm text-gray-400">
							Get the latest{" "}
							<a href="#" className="underline">
								Node.js and npm
							</a>
							.
						</p>
					</div>
					<div>
						<h3 className="text-xl font-semibold mb-4">Adopt the new Schema</h3>
						<div className="dark:bg-white/5 bg-black/10 rounded-lg p-4 mb-2">
							<code className="text-sm font-mono ">
								pnpx @better-auth/cli migrate
								<br />
							</code>
						</div>
						<p className="text-sm text-gray-400">
							Ensure you have the latest{" "}
							<code className="text-xs dark:bg-white/5 bg-black/10 px-1 py-0.5 rounded">
								schema required
							</code>{" "}
							by Better Auth.
							<code className="text-xs dark:bg-white/5 bg-black/10 px-1 py-0.5 rounded">
								You can also
							</code>{" "}
							add them manually. Read the{" "}
							<a
								href="/docs/concepts/database#core-schema"
								className="underline"
							>
								Core Schema
							</a>{" "}
							for full instructions.
						</p>
					</div>
					<div>
						<h3 className="text-xl font-semibold mb-4">
							Check out the change log, the new UI Builder, OpenAPI Docs, and
							more
						</h3>
						<p className="text-sm text-gray-400 mb-4">
							We have some exciting new features and updates that you should
							check out.
						</p>
						<Link
							className="w-full"
							href="https://github.com/better-auth/better-auth"
						>
							<Button variant="outline" className="w-full justify-between">
								<div className="flex items-center gap-2">
									<GitHubLogoIcon fontSize={10} />
									Star on GitHub
								</div>
								<ArrowRight className="w-4 h-4" />
							</Button>
						</Link>
						<Link className="w-full" href="https://discord.gg/better-auth">
							<Button
								variant="outline"
								className="w-full justify-between border-t-0"
							>
								<div className="flex items-center gap-2">
									<DiscordLogoIcon />
									Join Discord
								</div>
								<ArrowRight className="w-4 h-4" />
							</Button>
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}

function ChangelogItem({
	version,
	date,
	changes,
}: {
	version: string;
	date: string;
	changes: string[];
}) {
	return (
		<div className="border-l-2 border-white/10 pl-6 relative">
			<div className="absolute w-3 h-3 bg-white rounded-full -left-[7px] top-2" />
			<div className="flex items-center gap-4 mb-4">
				<h3 className="text-xl font-bold font-geist">{version}</h3>
				<span className="text-sm text-gray-400">{date}</span>
			</div>
			<ul className="space-y-3">
				{changes.map((change, i) => (
					<li key={i} className="text-gray-400">
						{change}
					</li>
				))}
			</ul>
		</div>
	);
}
