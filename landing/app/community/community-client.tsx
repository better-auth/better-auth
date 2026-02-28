"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import type { CommunityStats } from "@/lib/community-stats";

// Icons - using text-foreground for theme support
const GitHubIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 256 250"
		className={className}
	>
		<path
			fill="currentColor"
			d="M128.001 0C57.317 0 0 57.307 0 128.001c0 56.554 36.676 104.535 87.535 121.46c6.397 1.185 8.746-2.777 8.746-6.158c0-3.052-.12-13.135-.174-23.83c-35.61 7.742-43.124-15.103-43.124-15.103c-5.823-14.795-14.213-18.73-14.213-18.73c-11.613-7.944.876-7.78.876-7.78c12.853.902 19.621 13.19 19.621 13.19c11.417 19.568 29.945 13.911 37.249 10.64c1.149-8.272 4.466-13.92 8.127-17.116c-28.431-3.236-58.318-14.212-58.318-63.258c0-13.975 5-25.394 13.188-34.358c-1.329-3.224-5.71-16.242 1.24-33.874c0 0 10.749-3.44 35.21 13.121c10.21-2.836 21.16-4.258 32.038-4.307c10.878.049 21.837 1.47 32.066 4.307c24.431-16.56 35.165-13.12 35.165-13.12c6.967 17.63 2.584 30.65 1.255 33.873c8.207 8.964 13.173 20.383 13.173 34.358c0 49.163-29.944 59.988-58.447 63.157c4.591 3.972 8.682 11.762 8.682 23.704c0 17.126-.148 30.91-.148 35.126c0 3.407 2.304 7.398 8.792 6.14C219.37 232.5 256 184.537 256 128.002C256 57.307 198.691 0 128.001 0"
		/>
	</svg>
);

const DiscordIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		className={className}
	>
		<path
			fill="currentColor"
			d="M19.303 5.337A17.3 17.3 0 0 0 14.963 4c-.191.329-.403.775-.552 1.125a16.6 16.6 0 0 0-4.808 0C9.454 4.775 9.23 4.329 9.05 4a17 17 0 0 0-4.342 1.337C1.961 9.391 1.218 13.35 1.59 17.255a17.7 17.7 0 0 0 5.318 2.664a13 13 0 0 0 1.136-1.836c-.627-.234-1.22-.52-1.794-.86c.149-.106.297-.223.435-.34c3.46 1.582 7.207 1.582 10.624 0c.149.117.287.234.435.34c-.573.34-1.167.626-1.793.86a13 13 0 0 0 1.135 1.836a17.6 17.6 0 0 0 5.318-2.664c.457-4.52-.722-8.448-3.1-11.918M8.52 14.846c-1.04 0-1.889-.945-1.889-2.101s.828-2.102 1.89-2.102c1.05 0 1.91.945 1.888 2.102c0 1.156-.838 2.1-1.889 2.1m6.974 0c-1.04 0-1.89-.945-1.89-2.101s.828-2.102 1.89-2.102c1.05 0 1.91.945 1.889 2.102c0 1.156-.828 2.1-1.89 2.1"
		/>
	</svg>
);

const RedditIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 256 256"
		className={className}
	>
		<circle cx="128" cy="128" r="128" fill="currentColor" />
		<path
			fill="currentColor"
			className="text-background"
			d="M213.15 129.22c0-10.376-8.391-18.617-18.617-18.617a18.74 18.74 0 0 0-12.97 5.189c-12.818-9.157-30.368-15.107-49.9-15.87l8.544-39.981l27.773 5.95c.307 7.02 6.104 12.667 13.278 12.667c7.324 0 13.275-5.95 13.275-13.278c0-7.324-5.95-13.275-13.275-13.275c-5.188 0-9.768 3.052-11.904 7.478l-30.976-6.562c-.916-.154-1.832 0-2.443.458c-.763.458-1.22 1.22-1.371 2.136l-9.464 44.558c-19.837.612-37.692 6.562-50.662 15.872a18.74 18.74 0 0 0-12.971-5.188c-10.377 0-18.617 8.391-18.617 18.617c0 7.629 4.577 14.037 10.988 16.939a33.6 33.6 0 0 0-.458 5.646c0 28.686 33.42 52.036 74.621 52.036c41.202 0 74.622-23.196 74.622-52.036a35 35 0 0 0-.458-5.646c6.408-2.902 10.985-9.464 10.985-17.093M85.272 142.495c0-7.324 5.95-13.275 13.278-13.275c7.324 0 13.275 5.95 13.275 13.275s-5.95 13.278-13.275 13.278c-7.327.15-13.278-5.953-13.278-13.278m74.317 35.251c-9.156 9.157-26.553 9.768-31.588 9.768c-5.188 0-22.584-.765-31.59-9.768c-1.371-1.373-1.371-3.51 0-4.883c1.374-1.371 3.51-1.371 4.884 0c5.8 5.8 18.008 7.782 26.706 7.782s21.058-1.983 26.704-7.782c1.374-1.371 3.51-1.371 4.884 0c1.22 1.373 1.22 3.51 0 4.883m-2.443-21.822c-7.325 0-13.275-5.95-13.275-13.275s5.95-13.275 13.275-13.275c7.327 0 13.277 5.95 13.277 13.275c0 7.17-5.95 13.275-13.277 13.275"
		/>
	</svg>
);

const XIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="18"
		height="18"
		viewBox="0 0 24 24"
		className={className}
	>
		<path
			fill="currentColor"
			d="m17.687 3.063l-4.996 5.711l-4.32-5.711H2.112l7.477 9.776l-7.086 8.099h3.034l5.469-6.25l4.78 6.25h6.102l-7.794-10.304l6.625-7.571zm-1.064 16.06L5.654 4.782h1.803l10.846 14.34z"
		/>
	</svg>
);

const StarIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="currentColor"
		className={className}
	>
		<path d="M12 2l3.09 6.26L22 9.27l-5 4.87l1.18 6.88L12 17.77l-6.18 3.25L7 14.14L2 9.27l6.91-1.01L12 2z" />
	</svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
		<polyline points="7 10 12 15 17 10" />
		<line x1="12" y1="15" x2="12" y2="3" />
	</svg>
);

const UsersIcon = ({ className }: { className?: string }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
		className={className}
	>
		<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
		<circle cx="9" cy="7" r="4" />
		<path d="M22 21v-2a4 4 0 0 0-3-3.87" />
		<path d="M16 3.13a4 4 0 0 1 0 7.75" />
	</svg>
);

// Format large numbers
function formatNumber(num: number): string {
	if (num >= 1000000) {
		return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
	}
	if (num >= 1000) {
		return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
	}
	return num.toString();
}

// Animated counter component
function AnimatedCounter({
	value,
	duration = 2000,
}: {
	value: number;
	duration?: number;
}) {
	const [count, setCount] = useState(0);

	useEffect(() => {
		let startTime: number;
		let animationFrame: number;

		const animate = (timestamp: number) => {
			if (!startTime) startTime = timestamp;
			const progress = Math.min((timestamp - startTime) / duration, 1);

			// Easing function for smooth animation
			const easeOut = 1 - Math.pow(1 - progress, 3);
			setCount(Math.floor(easeOut * value));

			if (progress < 1) {
				animationFrame = requestAnimationFrame(animate);
			}
		};

		animationFrame = requestAnimationFrame(animate);
		return () => cancelAnimationFrame(animationFrame);
	}, [value, duration]);

	return <span>{formatNumber(count)}</span>;
}

// Community platforms
const platforms = [
	{
		name: "Discord",
		icon: DiscordIcon,
		href: "https://discord.gg/better-auth",
		cta: "Join Discord",
		members: "10,000+",
		label: "members",
	},
	{
		name: "GitHub",
		icon: GitHubIcon,
		href: "https://github.com/better-auth/better-auth",
		cta: "View on GitHub",
		members: "Open Source",
		label: "repository",
	},
	{
		name: "Reddit",
		icon: RedditIcon,
		href: "https://reddit.com/r/better_auth",
		cta: "Join Subreddit",
		members: "1.2K+",
		label: "members",
	},
	{
		name: "X (Twitter)",
		icon: XIcon,
		href: "https://x.com/better_auth",
		cta: "Follow on X",
		members: "@better_auth",
		label: "handle",
	},
];

function CommunityHero({ stats }: { stats: CommunityStats }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full"
		>
			<div className="space-y-6">
				<div className="space-y-2">
					<div className="flex items-center gap-1.5">
						<UsersIcon className="w-4 h-4 text-foreground/60" />
						<span className="text-sm text-foreground/60">Community</span>
					</div>
					<h1 className="text-lg md:text-xl lg:text-2xl text-foreground tracking-tight leading-tight">
						Join the community,
						<br />
						<span className="text-foreground/50">build together.</span>
					</h1>
					<p className="text-[11px] text-foreground/40 leading-relaxed max-w-[260px]">
						Connect with developers building with Better Auth.
					</p>
				</div>

				{/* Quick stats summary */}
				<div className="flex items-stretch gap-0 border border-foreground/[0.08]">
					<div className="flex-1 px-3 py-2.5 text-center border-r border-foreground/[0.08]">
						<p className="text-[8px] font-mono uppercase tracking-widest text-foreground/30 mb-1">
							NPM
						</p>
						<p className="text-sm font-light text-foreground/80 tabular-nums">
							{formatNumber(stats.npmDownloads)}
							<span className="text-[9px] text-foreground/50 font-mono">
								/mo
							</span>
						</p>
					</div>
					<div className="flex-1 px-3 py-2.5 text-center border-r border-foreground/[0.08] bg-foreground/[0.03]">
						<p className="text-[8px] font-mono uppercase tracking-widest text-foreground/30 mb-1">
							Stars
						</p>
						<p className="text-sm font-light text-foreground/80 tabular-nums">
							{formatNumber(stats.githubStars)}
						</p>
					</div>
					<div className="flex-1 px-3 py-2.5 text-center">
						<p className="text-[8px] font-mono uppercase tracking-widest text-foreground/30 mb-1">
							Discord
						</p>
						<p className="text-sm font-light text-foreground/80 tabular-nums">
							{formatNumber(stats.discordMembers)}
						</p>
					</div>
				</div>

				{/* Principles list */}
				<div className="border-t border-foreground/10 pt-4 space-y-0">
					{[
						{ label: "Framework", value: "Open source" },
						{ label: "Contributors", value: `${stats.contributors}+` },
						{ label: "License", value: "MIT" },
					].map((item, i) => (
						<motion.div
							key={item.label}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.25,
								delay: 0.3 + i * 0.06,
								ease: "easeOut",
							}}
							className="flex items-baseline justify-between py-1.5 border-b border-dashed border-foreground/[0.06] last:border-0"
						>
							<span className="text-[11px] text-foreground/40 uppercase tracking-wider">
								{item.label}
							</span>
							<span className="text-[11px] text-foreground/70 font-mono">
								{item.value}
							</span>
						</motion.div>
					))}
				</div>

				{/* CTA */}
				<div className="flex items-center gap-3 pt-1">
					<Link
						href="https://github.com/better-auth/better-auth"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-colors"
					>
						<GitHubIcon className="w-4 h-4" />
						<span className="ml-1">Star on GitHub</span>
					</Link>
				</div>
			</div>
		</motion.div>
	);
}

function StatCard({
	icon: Icon,
	label,
	value,
	subtext,
	index,
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	value: number;
	subtext: string;
	index: number;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: 0.1 + index * 0.06, ease: "easeOut" }}
			className="relative border border-dashed border-foreground/[0.08] hover:border-foreground/[0.14] transition-all duration-300 group"
		>
			<div className="p-5">
				<div className="flex items-center gap-2 mb-3">
					<Icon className="w-4 h-4 text-foreground/40" />
					<span className="text-[10px] font-mono uppercase tracking-widest text-foreground/40">
						{label}
					</span>
				</div>
				<div className="flex items-baseline gap-2">
					<span className="text-4xl font-light text-foreground tabular-nums">
						<AnimatedCounter value={value} />
					</span>
					<span className="text-[10px] text-foreground/30 font-mono">
						{subtext}
					</span>
				</div>
			</div>
		</motion.div>
	);
}

function PlatformCard({
	platform,
	index,
}: {
	platform: (typeof platforms)[number];
	index: number;
}) {
	const Icon = platform.icon;

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: 0.2 + index * 0.06, ease: "easeOut" }}
			className="relative border border-dashed border-foreground/[0.08] hover:border-foreground/[0.14] transition-all duration-300 group"
		>
			<div className="flex flex-col h-full p-5">
				{/* Header */}
				<div className="flex flex-col items-center gap-2 mb-3">
					<div className="bg-muted/20 border border-foreground/[0.06] p-2 rounded-full">
						<Icon className="size-8 text-foreground/50" />
					</div>
					<h3 className="text-base font-mono uppercase tracking-widest text-foreground/40">
						{platform.name}
					</h3>
				</div>

				{/* Stats */}
				<div className="border-t border-dashed border-foreground/[0.06] pt-3 mb-4">
					<div className="flex items-baseline justify-between">
						<span className="text-[9px] text-foreground/30 uppercase tracking-widest font-mono">
							{platform.label}
						</span>
						<span className="text-[11px] text-foreground/60 font-mono">
							{platform.members}
						</span>
					</div>
				</div>

				{/* CTA */}
				<Link
					href={platform.href}
					target="_blank"
					rel="noreferrer"
					className="block"
				>
					<div className="w-full py-2.5 text-center border flex items-center justify-center border-dashed border-foreground/[0.12] text-foreground/50 hover:text-foreground/80 hover:border-foreground/25 hover:bg-foreground/[0.02] transition-all cursor-pointer">
						<span className="font-mono text-[10px] uppercase tracking-widest">
							{platform.cta}
						</span>
					</div>
				</Link>
			</div>
		</motion.div>
	);
}

export function CommunityPageClient({ stats }: { stats: CommunityStats }) {
	return (
		<div className="relative h-full overflow-x-hidden pt-14 lg:pt-0">
			<div className="relative text-foreground h-full">
				<div className="flex flex-col lg:flex-row h-full">
					{/* Left side — Community hero */}
					<div className="hidden lg:block relative w-full lg:w-[30%] border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<CommunityHero stats={stats} />
					</div>

					{/* Right side — Stats & platforms */}
					<div className="relative w-full lg:w-[70%] overflow-y-auto overflow-x-hidden no-scrollbar">
						<div className="p-5 sm:p-6 lg:p-8 pt-8 lg:pt-16 pb-32 space-y-8">
							{/* Mobile header */}
							<div className="flex lg:hidden items-center gap-1.5">
								<UsersIcon className="w-4 h-4 text-foreground/60" />
								<span className="text-sm text-foreground/60">Community</span>
							</div>

							{/* Section: Statistics */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
							>
								<p className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-5">
									# In Numbers
								</p>

								<div className="grid grid-cols-2 gap-0">
									<StatCard
										icon={DownloadIcon}
										label="NPM Downloads"
										value={stats.npmDownloads}
										subtext="/ year"
										index={0}
									/>
									<StatCard
										icon={StarIcon}
										label="GitHub Stars"
										value={stats.githubStars}
										subtext="stars"
										index={1}
									/>
									<StatCard
										icon={UsersIcon}
										label="Contributors"
										value={stats.contributors}
										subtext="people"
										index={2}
									/>
									<StatCard
										icon={DiscordIcon}
										label="Discord Members"
										value={stats.discordMembers}
										subtext="members"
										index={3}
									/>
								</div>
							</motion.div>

							{/* Section: Platforms */}
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.4, delay: 0.25 }}
							>
								<p className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-5">
									# Join Us On
								</p>

								<div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
									{platforms.map((platform, index) => (
										<PlatformCard
											key={platform.name}
											platform={platform}
											index={index}
										/>
									))}
								</div>
							</motion.div>

							{/* Merch */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.35 }}
							>
								<Link
									href="https://better-merch.dev"
									target="_blank"
									rel="noreferrer"
									className="flex items-center justify-between w-full px-5 py-4 border border-dashed border-foreground/[0.08] hover:border-foreground/[0.14] hover:bg-foreground/[0.02] transition-all group"
								>
									<div className="flex items-center gap-2.5">
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.5"
											strokeLinecap="round"
											strokeLinejoin="round"
											className="text-foreground/40 group-hover:text-foreground/60 transition-colors"
										>
											<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
											<line x1="3" y1="6" x2="21" y2="6" />
											<path d="M16 10a4 4 0 0 1-8 0" />
										</svg>
										<span className="text-[11px] font-mono uppercase tracking-widest text-foreground/50 group-hover:text-foreground/70 transition-colors">
											Shop our merch collection
										</span>
									</div>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
										className="text-foreground/30 group-hover:text-foreground/60 transition-colors"
									>
										<line x1="7" y1="17" x2="17" y2="7" />
										<polyline points="7 7 17 7 17 17" />
									</svg>
								</Link>
							</motion.div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
