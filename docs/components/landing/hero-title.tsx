"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function HeroTitle() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative z-[2] w-full py-16 flex flex-col justify-center h-full pointer-events-none"
		>
			<div>
				<a
					href="https://agentauthprotocol.com"
					target="_blank"
					rel="noopener noreferrer"
					className="relative inline-flex items-center gap-1.5 px-2.5 py-1 pointer-events-auto group/badge rounded-full bg-neutral-200/80 dark:bg-neutral-800/80 hover:bg-neutral-200/70 dark:hover:bg-neutral-700/50 transition-colors"
				>
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
							d="M13 4V2c4.66.5 8.33 4.19 8.85 8.85c.6 5.49-3.35 10.43-8.85 11.03v-2c3.64-.45 6.5-3.32 6.96-6.96A7.994 7.994 0 0 0 13 4m-7.33.2A9.8 9.8 0 0 1 11 2v2.06c-1.43.2-2.78.78-3.9 1.68zM2.05 11a9.8 9.8 0 0 1 2.21-5.33L5.69 7.1A8 8 0 0 0 4.05 11zm2.22 7.33A10.04 10.04 0 0 1 2.06 13h2c.18 1.42.75 2.77 1.63 3.9zm1.4 1.41l1.39-1.37h.04c1.13.88 2.48 1.45 3.9 1.63v2c-1.96-.21-3.82-1-5.33-2.26M12 17l1.56-3.42L17 12l-3.44-1.56L12 7l-1.57 3.44L7 12l3.43 1.58z"
						/>
					</svg>
					<span className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-100 font-light">
						Introducing{" "}
						<span className="font-normal">| Agent Auth Protocol</span>
					</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="0.85em"
						height="0.85em"
						viewBox="0 0 24 24"
						className="text-neutral-500 dark:text-neutral-400 transition-transform group-hover/badge:translate-x-0.5"
						aria-hidden="true"
					>
						<path
							fill="none"
							stroke="currentColor"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							d="M5 12h14m-6-6l6 6l-6 6"
						/>
					</svg>
				</a>
				<h1 className="pt-3 sm:pt-4 text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight text-balance">
					The most comprehensive authentication framework
				</h1>

				{/* CTA Buttons */}
				<div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-4 sm:pt-5 pointer-events-auto">
					<Link
						href="/docs/installation"
						className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 text-xs sm:text-sm font-medium hover:opacity-90 transition-colors"
					>
						Get Started
					</Link>
					<Link
						href="https://dash.better-auth.com/sign-in"
						className="relative inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 text-neutral-600 dark:text-neutral-300 text-xs sm:text-sm font-medium transition-colors group"
					>
						{/* Diagonal lines background */}
						<span
							className="absolute inset-0 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity"
							style={{
								backgroundImage: `repeating-linear-gradient(
                  -45deg,
                  transparent,
                  transparent 4px,
                  currentColor 4px,
                  currentColor 5px
                )`,
							}}
						/>
						{/* Top border */}
						<span className="absolute top-0 -left-[6px] -right-[6px] h-px bg-foreground/20 group-hover:bg-foreground/30 transition-colors" />
						{/* Bottom border */}
						<span className="absolute bottom-0 -left-[6px] -right-[6px] h-px bg-foreground/20 group-hover:bg-foreground/30 transition-colors" />
						{/* Left border */}
						<span className="absolute left-0 -top-[6px] -bottom-[6px] w-px bg-foreground/20 group-hover:bg-foreground/30 transition-colors" />
						{/* Right border */}
						<span className="absolute right-0 -top-[6px] -bottom-[6px] w-px bg-foreground/20 group-hover:bg-foreground/30 transition-colors" />
						<span className="absolute -bottom-[6px] -right-[6px] font-mono text-[8px] text-foreground/40 dark:text-foreground/50 leading-none select-none translate-x-1/2 translate-y-1/2">
							+
						</span>
						<span className="relative">Sign In </span>
					</Link>
				</div>
			</div>
		</motion.div>
	);
}
