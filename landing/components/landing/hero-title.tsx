"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

const rotatingWords = ["the web", "Next.js", "TypeScript"];

export function HeroTitle() {
	const [wordIndex, setWordIndex] = useState(0);

	useEffect(() => {
		const interval = setInterval(() => {
			setWordIndex((i) => (i + 1) % rotatingWords.length);
		}, 2500);
		return () => clearInterval(interval);
	}, []);

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative z-[2] w-full py-8 sm:pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center h-full pointer-events-none"
		>
			<div className="space-y-2 sm:space-y-1">
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
							d="M13 4V2c4.66.5 8.33 4.19 8.85 8.85c.6 5.49-3.35 10.43-8.85 11.03v-2c3.64-.45 6.5-3.32 6.96-6.96A7.994 7.994 0 0 0 13 4m-7.33.2A9.8 9.8 0 0 1 11 2v2.06c-1.43.2-2.78.78-3.9 1.68zM2.05 11a9.8 9.8 0 0 1 2.21-5.33L5.69 7.1A8 8 0 0 0 4.05 11zm2.22 7.33A10.04 10.04 0 0 1 2.06 13h2c.18 1.42.75 2.77 1.63 3.9zm1.4 1.41l1.39-1.37h.04c1.13.88 2.48 1.45 3.9 1.63v2c-1.96-.21-3.82-1-5.33-2.26M12 17l1.56-3.42L17 12l-3.44-1.56L12 7l-1.57 3.44L7 12l3.43 1.58z"
						/>
					</svg>
					<span className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-100">
						Own Your Auth
					</span>
				</div>
				<h1 className="text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
					The most comprehensive authentication framework for{" "}
					<span className="relative inline-flex overflow-hidden align-bottom">
						<AnimatePresence mode="wait">
							<motion.span
								key={rotatingWords[wordIndex]}
								initial={{ y: "100%", opacity: 0 }}
								animate={{ y: 0, opacity: 1 }}
								exit={{ y: "-100%", opacity: 0 }}
								transition={{ duration: 0.3, ease: "easeInOut" }}
								className="inline-block border-b border-dashed border-foreground/20"
							>
								{rotatingWords[wordIndex]}
							</motion.span>
						</AnimatePresence>
					</span>
				</h1>

				{/* CTA Buttons */}
				<div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-3 sm:pt-4 lg:mt-5 pointer-events-auto">
					<a
						href="/sign-in"
						className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 text-xs sm:text-sm font-medium hover:opacity-90 transition-colors"
					>
						Get Started
					</a>
					<Link
						href="/docs"
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
						<span className="relative">Read Docs</span>
					</Link>
				</div>
			</div>
		</motion.div>
	);
}
