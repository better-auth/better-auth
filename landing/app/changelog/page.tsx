import Link from "next/link";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { createMetadata } from "@/lib/metadata";
import { ChangelogContent } from "./changelog-content";

export const dynamic = "force-static";

interface GitHubRelease {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	html_url: string;
	prerelease: boolean;
	published_at: string;
}

function getContent(content: string) {
	const lines = content.split("\n");
	const newContext = lines.map((line) => {
		if (line.trim().startsWith("## ") || line.trim().startsWith("### ")) {
			return line.split("date=")[0].trim();
		}
		if (line.trim().startsWith("- ")) {
			const mainContent = line.split(";")[0];
			const context = line.split(";")[2];
			const mentionMatches =
				(context ?? line)?.match(/@([A-Za-z0-9-]+)/g) ?? [];
			if (mentionMatches.length === 0) {
				return (mainContent || line).replace(/&nbsp/g, "");
			}
			const mentions = mentionMatches.map((match) => {
				const username = match.slice(1);
				const avatarUrl = `https://github.com/${username}.png`;
				return `[![${match}](${avatarUrl})](https://github.com/${username})`;
			});
			return (
				(mainContent || line).replace(/&nbsp/g, "") +
				" \u2013 " +
				mentions.join(" ")
			);
		}
		return line;
	});
	return newContext.join("\n");
}

export default async function ChangelogPage() {
	const res = await fetch(
		"https://api.github.com/repos/better-auth/better-auth/releases",
		{ next: { revalidate: 3600 } },
	);
	const releases: GitHubRelease[] = await res.json();

	const EXPANDABLE_LINE_THRESHOLD = 15;

	const messages = releases
		?.filter((release) => !release.prerelease)
		.map((release) => {
			const content = getContent(release.body);
			const lineCount = content
				.split("\n")
				.filter((l) => l.trim().length > 0).length;
			return {
				tag: release.tag_name,
				title: release.name,
				content,
				date: new Date(release.published_at).toLocaleDateString("en-US", {
					year: "numeric",
					month: "short",
					day: "numeric",
				}),
				url: release.html_url,
				expandable: lineCount > EXPANDABLE_LINE_THRESHOLD,
			};
		});

	return (
		<div className="flex flex-col lg:flex-row lg:h-dvh lg:overflow-hidden min-h-dvh pt-14 lg:pt-0">
			{/* Left panel — fixed, no scroll */}
			<div className="hidden lg:block relative w-full lg:w-[30%] lg:h-full shrink-0 border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
				<HalftoneBackground />
				<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="0.9em"
								height="0.9em"
								viewBox="0 0 24 24"
								className="text-foreground/60"
								aria-hidden="true"
							>
								<path
									fill="currentColor"
									d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89l.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54l.72-1.21l-3.5-2.08V8H12z"
								/>
							</svg>
							<span className="text-sm text-foreground/60">Changelog</span>
						</div>
						<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
							All changes, fixes, and updates
						</h1>
						<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[240px]">
							Every release shipped to Better Auth, straight from GitHub.
						</p>
					</div>

					<div className="border-t border-foreground/10 pt-4 mt-5 space-y-0">
						<div className="flex items-baseline justify-between py-1.5 border-b border-dashed border-foreground/[0.06]">
							<span className="text-xs text-foreground/70 dark:text-foreground/50 uppercase tracking-wider">
								Latest
							</span>
							<span className="text-xs text-foreground/85 dark:text-foreground/75 font-mono">
								{messages?.[0]?.tag ?? "\u2014"}
							</span>
						</div>
					</div>

					<div className="flex items-center gap-3 pt-4">
						<Link
							href="https://github.com/better-auth/better-auth/releases"
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-[12px] text-foreground/70 dark:text-foreground/50 hover:text-foreground/80 font-mono uppercase tracking-wider transition-colors"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								className="h-3 w-3 opacity-50"
							>
								<path
									fill="currentColor"
									d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
								/>
							</svg>
							GitHub Releases
						</Link>
					</div>
				</div>
			</div>

			{/* Right panel — releases (scrollable) */}
			<div className="w-full lg:w-[70%] lg:overflow-y-auto flex flex-col">
				{/* Mobile header */}
				<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden px-5 sm:px-6">
					<HalftoneBackground />
					<div className="relative space-y-2 py-16">
						<div className="flex items-center gap-1.5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="0.9em"
								height="0.9em"
								viewBox="0 0 24 24"
								className="text-foreground/60"
								aria-hidden="true"
							>
								<path
									fill="currentColor"
									d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89l.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7s-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54l.72-1.21l-3.5-2.08V8H12z"
								/>
							</svg>
							<span className="text-sm text-foreground/60">Changelog</span>
						</div>
						<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
							All changes, fixes, and updates
						</h1>
						<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
							Every release shipped to Better Auth, straight from GitHub.
						</p>
					</div>
				</div>

				<div className="px-5 pt-5 lg:p-8 lg:pt-16">
					<h2 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100">
						CHANGELOG
						<span className="flex-1 h-px bg-foreground/15" />
					</h2>
				</div>

				<ChangelogContent messages={messages ?? []} />

				<Footer />
			</div>
		</div>
	);
}

export const metadata = createMetadata({
	title: "Changelog",
	description: "Latest changes, fixes, and updates to Better Auth",
});
