import { AlertTriangle, Download, ExternalLink, Star } from "lucide-react";
import Link from "next/link";
import { ViewTransition } from "react";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { InstallCommand } from "@/components/marketplace/install-command";
import { MarketplaceReadme } from "@/components/marketplace/readme";
import { formatCount } from "@/lib/marketplace/format";
import type { MarketplacePluginDetail } from "@/lib/marketplace/types";

function GitHubIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
			aria-hidden="true"
		>
			<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
		</svg>
	);
}

function formatDate(value: string | null): string {
	if (!value) return "—";
	try {
		return new Intl.DateTimeFormat("en", {
			year: "numeric",
			month: "short",
			day: "numeric",
		}).format(new Date(value));
	} catch {
		return "—";
	}
}

function PluginMetaPanel({ plugin }: { plugin: MarketplacePluginDetail }) {
	const githubUrl = `https://github.com/${plugin.repo}`;
	const npmUrl = plugin.npmPackage
		? `https://www.npmjs.com/package/${plugin.npmPackage}`
		: null;

	return (
		<div className="space-y-5">
			<div className="space-y-4">
				<Link
					href="/marketplace"
					transitionTypes={["nav-back"]}
					className="flex items-center gap-1.5 text-foreground/40 hover:text-foreground/70 transition-colors group w-fit"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="transition-transform group-hover:-translate-x-0.5"
						aria-hidden="true"
					>
						<path d="m15 18-6-6 6-6" />
					</svg>
					<span className="text-xs uppercase tracking-wider">All plugins</span>
				</Link>

				<div className="space-y-1 pt-1 max-w-md">
					<span className="font-mono text-[10px] uppercase tracking-wider text-foreground/45">
						{plugin.category}
					</span>
					<h1 className="text-2xl lg:text-3xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						{plugin.name}
					</h1>
					<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed pt-0.5">
						{plugin.description}
					</p>
				</div>

				<a
					href={`https://github.com/${plugin.author.github}`}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-2.5 text-sm text-foreground/70 transition-colors hover:text-foreground w-fit"
				>
					<img
						src={plugin.author.avatar}
						alt=""
						className="size-7 rounded-full border border-foreground/10"
					/>
					<span>{plugin.author.name}</span>
				</a>
			</div>

			<div className="grid grid-cols-2 gap-px border border-foreground/10 bg-foreground/10">
				<div className="bg-background/80 px-3 py-2.5">
					<p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-foreground/45">
						Stars
					</p>
					<p className="inline-flex items-center gap-1 text-sm tabular-nums text-foreground/80">
						<Star className="size-3 fill-foreground/40 text-foreground/40" />
						{formatCount(plugin.enrichment.stars)}
					</p>
				</div>
				<div className="bg-background/80 px-3 py-2.5">
					<p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-foreground/45">
						Downloads
					</p>
					<p className="inline-flex items-center gap-1 text-sm tabular-nums text-foreground/80">
						<Download className="size-3 text-foreground/40" />
						{formatCount(plugin.enrichment.npmDownloads)}
					</p>
				</div>
				<div className="bg-background/80 px-3 py-2.5">
					<p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-foreground/45">
						Updated
					</p>
					<p className="text-sm text-foreground/80">
						{formatDate(plugin.enrichment.lastPush)}
					</p>
				</div>
				<div className="bg-background/80 px-3 py-2.5">
					<p className="mb-1 font-mono text-[9px] uppercase tracking-widest text-foreground/45">
						License
					</p>
					<p className="text-sm text-foreground/80">
						{plugin.enrichment.license ?? "—"}
					</p>
				</div>
			</div>

			{plugin.npmPackage && (
				<InstallCommand
					npmPackage={plugin.npmPackage}
					className="w-full justify-between"
				/>
			)}

			<div className="flex flex-col gap-2">
				<a
					href={githubUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center justify-center gap-2 border border-foreground/15 bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
				>
					<GitHubIcon className="size-3.5" />
					View on GitHub
				</a>
				{npmUrl && (
					<a
						href={npmUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center justify-center gap-2 border border-foreground/10 px-3 py-2 text-xs text-foreground/70 transition-colors hover:border-foreground/20 hover:text-foreground"
					>
						View on npm
						<ExternalLink className="size-3" />
					</a>
				)}
			</div>

			{plugin.tags && plugin.tags.length > 0 && (
				<div className="flex flex-wrap gap-1.5 border-t border-foreground/[0.06] pt-4">
					{plugin.tags.map((tag) => (
						<span
							key={tag}
							className="border border-foreground/10 px-2 py-0.5 font-mono text-[10px] text-foreground/50"
						>
							{tag}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

export function PluginDetail({ plugin }: { plugin: MarketplacePluginDetail }) {
	const githubUrl = `https://github.com/${plugin.repo}`;
	const transitionName = `marketplace-plugin-${plugin.slug}`;

	return (
		<div className="flex flex-col lg:flex-row h-full min-h-dvh pt-14 lg:pt-0">
			{/* Left panel — plugin meta */}
			<div className="relative w-full lg:w-[30%] lg:h-dvh lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-y-auto overflow-x-hidden px-5 sm:px-6 lg:px-10">
				<HalftoneBackground />
				<div className="relative w-full py-16 lg:py-0 flex flex-col justify-center lg:min-h-dvh">
					<ViewTransition
						name={transitionName}
						share="marketplace-plugin-morph"
					>
						<div className="rounded-none">
							<PluginMetaPanel plugin={plugin} />
						</div>
					</ViewTransition>
				</div>
			</div>

			{/* Right panel — README */}
			<div className="w-full lg:w-[70%] flex flex-col">
				<ViewTransition
					enter={{
						"nav-forward": "marketplace-enter",
						"nav-back": "marketplace-enter",
						default: "none",
					}}
					exit={{
						"nav-forward": "marketplace-exit",
						"nav-back": "marketplace-exit",
						default: "none",
					}}
					default="none"
				>
					<div className="relative px-5 sm:px-6 lg:px-8 pb-24 pt-8 lg:py-20">
						<div className="mb-6 border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 max-w-3xl">
							<div className="flex gap-2.5">
								<AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
								<div className="space-y-1">
									<p className="text-sm font-medium text-foreground/85">
										Community-maintained
									</p>
									<p className="text-xs leading-relaxed text-foreground/55">
										This plugin is built and maintained by the community. It is
										not officially supported by the Better Auth team. Review the
										repository before using it in production.
									</p>
								</div>
							</div>
						</div>

						{plugin.readme ? (
							<MarketplaceReadme
								content={plugin.readme}
								repo={plugin.repo}
								branch={plugin.enrichment.defaultBranch}
								readmeFilePath={plugin.readmeFilePath}
							/>
						) : (
							<div className="border border-dashed border-foreground/15 px-6 py-12 text-center max-w-3xl">
								<p className="mb-2 text-sm text-foreground/70">
									README could not be loaded
								</p>
								<p className="mb-4 text-xs text-foreground/45">
									{plugin.description}
								</p>
								<a
									href={githubUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-xs text-foreground/70 underline decoration-foreground/25 underline-offset-2 hover:text-foreground"
								>
									View on GitHub
									<ExternalLink className="size-3" />
								</a>
							</div>
						)}
					</div>
				</ViewTransition>
				<Footer />
			</div>
		</div>
	);
}
