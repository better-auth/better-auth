"use client";

import { motion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

const ctaHref = `/sign-in?callbackUrl=${encodeURIComponent("/dashboard?redirectTo=/settings/billing")}`;
const pricingTiers = [
	{
		name: "Starter",
		filename: "starter",
		price: "$0",
		priceNote: "/mo",
		priceLabel: "$0 / month",
		seats: "1 dashboard seat",
		featuresPrefix: "Includes",
		features: [
			"All auth features",
			"User management",
			"Audit logs (1 day)",
			"1 dashboard seat",
			"10k events/mo included",
		],
		cta: "Get Started",
		ctaHref: "/sign-in",
		ctaStyle: "outline" as const,
		highlighted: false,
		isFree: true,
	},
	{
		name: "Pro",
		filename: "pro-plan",
		price: "$49",
		priceNote: "/mo + $10/additional seat",
		priceLabel: "$49 / month",
		seats: "3 seats included",
		featuresPrefix: "Everything in Starter +",
		features: [
			"3 seats included",
			"100k events/mo included",
			"Security detection (1k/mo)",
			"Audit logs (7 days)",
			"Transactional email & SMS",
			"Email templates & abuse protection",
		],
		cta: "Select Plan",
		ctaHref,
		ctaStyle: "outline" as const,
		highlighted: true,
		isFree: false,
	},
	{
		name: "Business",
		filename: "business-plan",
		price: "$299",
		priceNote: "/mo + $10/additional seat",
		priceLabel: "$299 / month",
		seats: "5 seats included",
		featuresPrefix: "Everything in Pro +",
		features: [
			"Self-service SSO included",
			"500k events/mo included",
			"Security detection (10k/mo)",
			"Audit logs (30 days)",
			"Log drain",
			"Email support",
			"5 seats included",
		],
		cta: "Select Plan",
		ctaHref,
		ctaStyle: "outline" as const,
		highlighted: false,
		isFree: false,
	},
	{
		name: "Enterprise",
		filename: "enterprise-plan",
		price: "Custom",
		priceNote: null,
		priceLabel: "Custom pricing",
		seats: "Unlimited seats",
		featuresPrefix: "Everything in Business +",
		features: [
			"Custom events volume",
			"Custom security detection",
			"Dashboard RBAC",
			"Custom audit logs",
			"Implementation assistance",
			"Advanced support",
			"Unlimited seats",
		],
		cta: "Contact Us",
		ctaHref: "/company",
		ctaStyle: "outline" as const,
		highlighted: false,
		isFree: false,
	},
];

// Comparison table data
const comparisonRows = [
	{
		label: "All auth features",
		starter: true,
		pro: true,
		business: true,
		enterprise: true,
	},
	{
		label: "Dashboard seats",
		starter: "1",
		pro: "3",
		business: "5",
		enterprise: "Unlimited",
	},
	{
		label: "Additional seats",
		starter: false,
		pro: "$10/seat",
		business: "$10/seat",
		enterprise: "Included",
	},
	{
		label: "User management",
		starter: true,
		pro: true,
		business: true,
		enterprise: true,
	},
	{
		label: "Events included",
		starter: "10k/mo",
		pro: "100k/mo",
		business: "500k/mo",
		enterprise: "Custom",
	},
	{
		label: "Additional events",
		starter: false,
		pro: "$5/100k",
		business: "$5/100k",
		enterprise: "Custom",
	},
	{
		label: "Audit logs",
		starter: "1 day",
		pro: "7 days",
		business: "30 days",
		enterprise: "Custom",
	},
	{
		label: "Security detection",
		starter: false,
		pro: "1k/mo",
		business: "10k/mo",
		enterprise: "Custom",
	},
	{
		label: "Additional security events",
		starter: false,
		pro: "$100/100k",
		business: "$100/100k",
		enterprise: "Custom",
	},
	{
		label: "Transactional email & SMS",
		starter: false,
		pro: true,
		business: true,
		enterprise: true,
	},
	{
		label: "Email templates & abuse protection",
		starter: false,
		pro: true,
		business: true,
		enterprise: true,
	},
	{
		label: "Self-service SSO",
		starter: false,
		pro: false,
		business: true,
		enterprise: true,
	},
	{
		label: "Dashboard RBAC",
		starter: false,
		pro: false,
		business: false,
		enterprise: true,
	},
	{
		label: "Custom audit logs",
		starter: false,
		pro: false,
		business: false,
		enterprise: true,
	},
	{
		label: "Log drain",
		starter: false,
		pro: false,
		business: true,
		enterprise: true,
	},
	{
		label: "Community support",
		starter: true,
		pro: true,
		business: true,
		enterprise: true,
	},
	{
		label: "Email support",
		starter: false,
		pro: false,
		business: true,
		enterprise: true,
	},
	{
		label: "Implementation assistance",
		starter: false,
		pro: false,
		business: false,
		enterprise: true,
	},
	{
		label: "Advanced support",
		starter: false,
		pro: false,
		business: false,
		enterprise: true,
	},
];

function ComparisonCell({ value }: { value: string | boolean }) {
	if (value === true)
		return (
			<span className="inline-flex items-center justify-center w-5 h-5">
				<Check className="w-3.5 h-3.5 text-foreground/70" />
			</span>
		);
	if (value === false)
		return (
			<span className="inline-flex items-center justify-center w-5 h-5">
				<Minus className="w-3 h-3 text-foreground/40 " />
			</span>
		);
	return (
		<span className="text-xs text-foreground/80 dark:text-foreground/60 font-mono">
			{value}
		</span>
	);
}

function PricingHero() {
	const principles = [
		{ label: "Framework", value: "Open source" },
		{ label: "Users", value: "Unlimited" },
		{ label: "Plugins", value: "50+ included" },
		{ label: "Events", value: "From 10k/mo" },
		{ label: "Extra seats", value: "$10/seat (Pro+)" },
		{ label: "Security", value: "$100/100k overage" },
		{ label: "SSO", value: "Business+" },
	];

	const tiers = [
		{ name: "Starter", price: "$0", note: "/mo" },
		{ name: "Pro", price: "$49", note: "/mo", highlight: true },
		{ name: "Business", price: "$299", note: "/mo" },
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
					<h1 className="text-lg md:text-xl lg:text-2xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						<span className="underline underline-offset-4 decoration-foreground/30">
							Infrastructure
						</span>
					</h1>
					<p className="text-[11px] text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[260px]">
						Dashboard, security, audit logs, and more for your auth.
					</p>
				</div>

				{/* Quick tier summary */}
				<div className="flex items-stretch gap-0 border border-foreground/[0.08]">
					{tiers.map((tier) => (
						<div
							key={tier.name}
							className={`flex-1 px-3 py-2.5 text-center border-r border-foreground/[0.08] last:border-r-0 ${
								tier.highlight ? "bg-foreground/[0.03]" : ""
							}`}
						>
							<p className="text-[8px] font-mono uppercase tracking-widest text-foreground/60 dark:text-foreground/40 mb-1">
								{tier.name}
							</p>
							<p className="text-sm font-light text-foreground/80 tabular-nums flex items-baseline justify-center gap-0.5">
								<span>{tier.price}</span>
								{tier.note && (
									<span className="text-[9px] text-foreground/50 dark:text-foreground/55 font-mono">
										{tier.note}
									</span>
								)}
							</p>
						</div>
					))}
				</div>

				{/* Principles list */}
				<div className="border-t border-foreground/10 pt-4 space-y-0">
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

				{/* CTA */}
				<div className="flex items-center gap-3 pt-1">
					<Link
						href="/docs/installation"
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

function PricingCard({
	tier,
	index,
}: {
	tier: (typeof pricingTiers)[number];
	index: number;
}) {
	const isHighlighted = tier.highlighted;

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.3,
				delay: 0.1 + index * 0.06,
				ease: "easeOut",
			}}
			className={`relative flex flex-col -mt-px -ml-px overflow-hidden transition-all duration-300 group ${
				isHighlighted
					? "bg-foreground/[0.025]"
					: "border border-dashed border-foreground/[0.08] hover:border-foreground/[0.14]"
			}`}
		>
			{/* Top accent for highlighted card */}
			{isHighlighted && (
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
			)}

			<div className="flex flex-col flex-1 p-5">
				{/* Tier name + badge */}
				<div className="flex items-center gap-2 mb-4">
					<h3 className="text-[11px] font-mono uppercase tracking-widest text-foreground/70 dark:text-foreground/50">
						{tier.name}
					</h3>
					{isHighlighted && (
						<span className="text-[9px] font-mono uppercase tracking-widest text-foreground/70 dark:text-foreground/50 border border-dashed border-foreground/15 px-1.5 py-0.5 leading-none">
							popular
						</span>
					)}
				</div>

				{/* Price */}
				<div className="flex items-baseline gap-1.5 mb-3">
					<span
						className={`font-light tracking-tight text-foreground/90 ${
							tier.price === "Custom" ? "text-3xl" : "text-4xl tabular-nums"
						}`}
					>
						{tier.price}
					</span>
					{tier.priceNote && (
						<span className="text-[11px] text-foreground/60 dark:text-foreground/40 font-mono">
							{tier.priceNote}
						</span>
					)}
				</div>

				{/* Features */}
				<div className="flex-1 mb-5">
					<p className="text-[10px] text-foreground/60 dark:text-foreground/40 uppercase tracking-widest font-mono mb-3">
						{tier.featuresPrefix}
					</p>
					<ul className="space-y-2.5">
						{tier.features.map((feature) => (
							<li
								key={feature}
								className="flex items-start gap-2 text-[13px] text-foreground/80 dark:text-foreground/60 group-hover:text-foreground/85 dark:group-hover:text-foreground/65 transition-colors duration-300"
							>
								<span className="text-foreground/50 dark:text-foreground/55 mt-0.5 font-mono text-[10px] leading-none select-none shrink-0">
									+
								</span>
								<span>{feature}</span>
							</li>
						))}
					</ul>
				</div>

				{/* CTA */}
				<div className="mt-auto">
					<a href={tier.ctaHref} className="block">
						<div
							className={`w-full py-2.5 text-center transition-all duration-200 cursor-pointer ${
								isHighlighted
									? "bg-foreground text-background hover:opacity-90"
									: "border border-dashed border-foreground/[0.12] text-foreground/70 dark:text-foreground/50 hover:text-foreground/80 hover:border-foreground/25 hover:bg-foreground/[0.02]"
							}`}
						>
							<span className="font-mono text-[11px] uppercase tracking-widest">
								{tier.cta}
							</span>
						</div>
					</a>
				</div>
			</div>
		</motion.div>
	);
}

export function PricingPageClient() {
	const tierKeys = ["starter", "pro", "business", "enterprise"] as const;
	const tierLabels = ["Starter", "Pro", "Business", "Enterprise"];

	return (
		<div className="relative h-full overflow-x-hidden pt-14 lg:pt-0">
			<div className="relative text-foreground h-full">
				<div className="flex flex-col lg:flex-row h-full">
					{/* Left side — Pricing hero */}
					<div className="hidden lg:block relative w-full lg:w-[30%] border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<PricingHero />
					</div>

					{/* Right side — Plans & comparison */}
					<div className="relative w-full lg:w-[70%] overflow-y-auto overflow-x-hidden no-scrollbar">
						<div className="p-5 sm:p-6 lg:p-8 pt-8 lg:pt-16 pb-32 space-y-8">
							<div className="flex lg:hidden items-center gap-1.5">
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
										d="M7 15h7v2H7zm0-4h10v2H7zm0-4h10v2H7zM19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-7 0c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1m7 16H5V5h2v3h10V5h2z"
									/>
								</svg>
								<span className="text-sm text-foreground/60">Pricing</span>
							</div>

							{/* Section: Open Source */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
							>
								<p className="text-[11px] uppercase tracking-widest text-foreground/55 dark:text-foreground/40 font-mono mb-5">
									<span className="text-foreground/75 dark:text-foreground/60">
										# Framework
									</span>
								</p>

								<div className="relative border border-dashed border-foreground/[0.12] bg-foreground/[0.02] overflow-hidden">
									<div className="px-5 py-5">
										<div className="flex items-start justify-between gap-6">
											<div className="space-y-2.5 flex-1">
												<div className="flex items-center gap-2">
													<h3 className="text-[11px] font-mono uppercase tracking-widest text-foreground/85">
														Community
													</h3>
													<span className="text-[9px] font-mono uppercase tracking-widest text-foreground/75 dark:text-foreground/60 border border-dashed border-foreground/15 px-1.5 py-0.5 leading-none">
														open source
													</span>
												</div>
												<p className="text-[13px] text-foreground/80 dark:text-foreground/65 leading-relaxed max-w-md">
													Comprehensive authentication and authorization
													framework.
												</p>
											</div>
											<div className="text-right shrink-0 flex flex-col items-end gap-3">
												<Link
													href="/docs"
													className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/[0.12] text-foreground/70 dark:text-foreground/50 hover:text-foreground/80 hover:border-foreground/25 hover:bg-foreground/[0.02] transition-all"
												>
													<span className="font-mono text-[11px] uppercase tracking-widest">
														Read Docs
													</span>
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
									</div>
								</div>
							</motion.div>

							{/* Section: Plans */}
							<motion.div
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ duration: 0.4, delay: 0.15 }}
							>
								<p className="text-[11px] uppercase tracking-widest text-foreground/55 dark:text-foreground/40 font-mono mb-5">
									<span className="text-foreground/75 dark:text-foreground/60">
										# Infrastructure
									</span>
								</p>

								{/* Pricing Cards */}
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
									{pricingTiers.map((tier, index) => (
										<PricingCard key={tier.name} tier={tier} index={index} />
									))}
								</div>

								<div className="mt-4 px-1">
									<p className="text-xs text-foreground/45 dark:text-foreground/35 leading-relaxed">
										<span className="text-foreground/60 dark:text-foreground/50 font-mono uppercase tracking-wider">
											What&apos;s an event?
										</span>{" "}
										An event is any auth action tracked by the dashboard &mdash;
										sign-ins, sign-ups, session refreshes, password resets, OTP
										verifications, and more. Each API call that triggers an auth
										action counts as one event.
									</p>
								</div>
							</motion.div>

							{/* Section: Feature comparison */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.45 }}
							>
								<p className="text-[11px] uppercase tracking-widest text-foreground/55 dark:text-foreground/40 font-mono mb-5">
									# feature comparison
								</p>

								<div className="border border-dashed border-foreground/[0.08] overflow-x-auto">
									<table className="w-full min-w-[600px]">
										<thead>
											<tr className="border-b border-foreground/[0.08]">
												<th className="text-left text-[11px] uppercase tracking-widest text-foreground/60 dark:text-foreground/40 font-mono font-normal py-3 px-5 w-[28%]">
													Feature
												</th>
												{tierLabels.map((name) => (
													<th
														key={name}
														className={`text-center text-[11px] uppercase tracking-widest font-mono font-normal py-3 px-3 w-[18%] ${
															name === "Pro"
																? "text-foreground/80 bg-foreground/[0.025]"
																: "text-foreground/60 dark:text-foreground/40"
														}`}
													>
														{name}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{comparisonRows.map((row, i) => (
												<tr
													key={row.label}
													className={`border-b border-dashed border-foreground/[0.04] last:border-0 transition-colors duration-150 hover:bg-foreground/[0.01] ${
														i % 2 === 0 ? "bg-foreground/[0.008]" : ""
													}`}
												>
													<td className="text-[13px] text-foreground/80 dark:text-foreground/60 py-2.5 px-5">
														{row.label}
													</td>
													{tierKeys.map((tier) => (
														<td
															key={tier}
															className={`text-center py-2.5 px-3 ${
																tier === "pro" ? "bg-foreground/[0.025]" : ""
															}`}
														>
															<ComparisonCell
																value={row[tier] as string | boolean}
															/>
														</td>
													))}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</motion.div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
