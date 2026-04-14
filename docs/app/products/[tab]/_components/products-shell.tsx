"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

function FrameworkHero() {
	const highlights = [{ label: "License", value: "MIT" }];

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full"
		>
			<div className="space-y-6">
				<div className="space-y-2">
					<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						<span className="underline underline-offset-4 decoration-foreground/30">
							Open Source
						</span>
					</h1>
					<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[260px]">
						A comprehensive, framework-agnostic authentication library for
						TypeScript. Free and open source under the MIT license.
					</p>
				</div>

				<div className="border-t border-foreground/10 pt-4 space-y-0">
					{highlights.map((item, i) => (
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
							<span className="text-[11px] text-foreground/70 dark:text-foreground/50 uppercase tracking-wider">
								{item.label}
							</span>
							<span className="text-[11px] text-foreground/85 dark:text-foreground/75 font-mono">
								{item.value}
							</span>
						</motion.div>
					))}
				</div>

				<div className="flex items-center gap-3 pt-1">
					<Link
						href="/docs"
						className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-colors"
					>
						Read Docs
					</Link>
					<Link
						href="https://github.com/better-auth/better-auth"
						className="inline-flex items-center gap-1.5 text-[12px] text-foreground/70 dark:text-foreground/50 hover:text-foreground/80 font-mono uppercase tracking-wider transition-colors"
					>
						GitHub
						<svg
							className="h-2.5 w-2.5 opacity-50"
							viewBox="0 0 10 10"
							fill="none"
						>
							<path
								d="M1 9L9 1M9 1H3M9 1V7"
								stroke="currentColor"
								strokeWidth="1.2"
							/>
						</svg>
					</Link>
				</div>
			</div>
		</motion.div>
	);
}

function InfrastructureHero() {
	const principles = [
		{ label: "Framework", value: "Open source" },
		{ label: "Users", value: "Unlimited" },
		{ label: "Audit logs", value: "From 10k/mo" },
		{ label: "Security", value: "$0.0001/event overage" },
		{ label: "SSO", value: "Enterprise" },
	];

	const tiers = [
		{ name: "Starter", price: "$0", note: "/mo" },
		{ name: "Pro", price: "$20", note: "/mo", highlight: true },
		{ name: "Enterprise", price: "Custom", note: null },
	];

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full"
		>
			<div className="space-y-6">
				<div className="space-y-2">
					<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-100 tracking-tight leading-tight">
						<span className="underline underline-offset-4 decoration-foreground/40">
							Infrastructure
						</span>
					</h1>
					<p className="text-sm text-foreground/75 dark:text-foreground/65 leading-relaxed max-w-[260px]">
						Dashboard, security, audit logs, and more for your auth.
					</p>
				</div>

				<div className="flex items-stretch gap-0 border border-foreground/[0.12]">
					{tiers.map((tier) => (
						<div
							key={tier.name}
							className={`flex-1 px-3 py-2.5 text-center border-r border-foreground/[0.12] last:border-r-0 ${
								tier.highlight ? "bg-foreground/[0.04]" : ""
							}`}
						>
							<p className="text-[8px] font-mono uppercase tracking-widest text-foreground/65 dark:text-foreground/55 mb-1">
								{tier.name}
							</p>
							<p className="text-sm font-light text-foreground/85 dark:text-foreground/80 tabular-nums flex items-baseline justify-center gap-0.5">
								<span>{tier.price}</span>
								{tier.note && (
									<span className="text-[9px] text-foreground/55 dark:text-foreground/60 font-mono">
										{tier.note}
									</span>
								)}
							</p>
						</div>
					))}
				</div>

				<div className="border-t border-foreground/[0.12] pt-4 space-y-0">
					{principles.map((item, i) => (
						<motion.div
							key={item.label}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.25,
								delay: 0.3 + i * 0.06,
								ease: "easeOut",
							}}
							className="flex items-baseline justify-between py-1.5 border-b border-dashed border-foreground/[0.08] last:border-0"
						>
							<span className="text-[11px] text-foreground/75 dark:text-foreground/60 uppercase tracking-wider">
								{item.label}
							</span>
							<span className="text-[11px] text-foreground/90 dark:text-foreground/80 font-mono">
								{item.value}
							</span>
						</motion.div>
					))}
				</div>

				<div className="flex items-center gap-3 pt-1">
					<Link
						href="https://dash.better-auth.com/sign-in"
						className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-colors"
					>
						Get Started
					</Link>
					<Link
						href="/enterprise"
						className="inline-flex items-center gap-1.5 text-[12px] text-foreground/70 dark:text-foreground/50 hover:text-foreground/80 font-mono uppercase tracking-wider transition-colors"
					>
						Contact Sales
						<svg
							className="h-2.5 w-2.5 opacity-50"
							viewBox="0 0 10 10"
							fill="none"
						>
							<path
								d="M1 9L9 1M9 1H3M9 1V7"
								stroke="currentColor"
								strokeWidth="1.2"
							/>
						</svg>
					</Link>
				</div>
			</div>
		</motion.div>
	);
}

export function ProductsShell({
	tab,
	children,
}: {
	tab: string;
	children: React.ReactNode;
}) {
	const isInfrastructure = tab === "infrastructure";

	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left side — Hero */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<AnimatePresence mode="wait">
							{isInfrastructure ? (
								<motion.div
									key="infrastructure-hero"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: 10 }}
									transition={{ duration: 0.25 }}
									className="h-full"
								>
									<InfrastructureHero />
								</motion.div>
							) : (
								<motion.div
									key="framework-hero"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: 10 }}
									transition={{ duration: 0.25 }}
									className="h-full"
								>
									<FrameworkHero />
								</motion.div>
							)}
						</AnimatePresence>
					</div>

					{/* Right side — Content */}
					<div className="relative w-full lg:w-[70%] overflow-x-hidden no-scrollbar">
						<div className="px-5 lg:px-8 lg:pt-20">
							{/* Mobile header */}
							<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden -mx-5 sm:-mx-6 px-5 sm:px-6 mb-5">
								<HalftoneBackground />
								<div className="relative space-y-2 py-16">
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
										{isInfrastructure ? (
											<span className="underline underline-offset-4 decoration-foreground/40">
												Infrastructure
											</span>
										) : (
											<span className="underline underline-offset-4 decoration-foreground/30">
												Open Source
											</span>
										)}
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
										{isInfrastructure
											? "Dashboard, security, audit logs, and more for your auth."
											: "A comprehensive, framework-agnostic authentication library for TypeScript. Free and open source under the MIT license."}
									</p>
								</div>
							</div>
							<AnimatePresence mode="wait">
								<motion.h2
									key={tab}
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.2 }}
									className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-5"
								>
									{isInfrastructure ? "INFRASTRUCTURE" : "FRAMEWORK"}
									<span className="flex-1 h-px bg-foreground/15" />
								</motion.h2>
							</AnimatePresence>
						</div>

						{children}
						<Footer />
					</div>
				</div>
			</div>
		</div>
	);
}
