import { HalftoneBackground } from "@/components/landing/halftone-bg";

interface BlogLeftPanelProps {
	postCount?: number;
}

export function BlogLeftPanel({ postCount }: BlogLeftPanelProps) {
	return (
		<div className="relative w-full lg:w-[30%] lg:h-dvh lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
			<HalftoneBackground />
			<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-dvh">
				<div className="space-y-4">
					<div className="space-y-1">
						<div className="flex items-center gap-1.5">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="0.9em"
								height="0.9em"
								viewBox="0 0 24 24"
								className="text-neutral-600 dark:text-neutral-100"
								aria-hidden="true"
							>
								<path
									fill="currentColor"
									d="M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"
								/>
							</svg>
							<span className="text-sm text-neutral-600 dark:text-neutral-100">
								Blog
							</span>
						</div>
						<h1 className="text-lg md:text-xl lg:text-2xl xl:text-3xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
							News, releases, and insights
						</h1>
						<p className="text-[11px] text-foreground/40 leading-relaxed max-w-[240px] pt-1">
							Follow along as we build the most comprehensive authentication
							framework for the web.
						</p>
					</div>

					{/* Social & RSS */}
					<div className="flex items-center gap-3 pt-2">
						<a
							href="https://github.com/better-auth/better-auth"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5 text-foreground/30 hover:text-foreground/70 transition-colors"
							aria-label="GitHub"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
								/>
							</svg>
						</a>
						<a
							href="https://x.com/better_auth"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1.5 text-foreground/30 hover:text-foreground/70 transition-colors"
							aria-label="X (Twitter)"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="13"
								height="13"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
								/>
							</svg>
						</a>
						<a
							href="/rss.xml"
							className="flex items-center gap-1.5 text-foreground/30 hover:text-foreground/70 transition-colors"
							aria-label="RSS Feed"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="14"
								height="14"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27zm0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93z"
								/>
							</svg>
						</a>
					</div>

					{/* Post count - only shown when postCount is provided */}
					{postCount !== undefined && (
						<div className="hidden lg:block border-t border-foreground/[0.06] pt-4">
							<div className="flex items-baseline justify-between">
								<span className="text-[11px] text-foreground/40 uppercase tracking-wider">
									Posts
								</span>
								<span className="text-[11px] text-foreground/70 font-mono">
									{postCount}
								</span>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
