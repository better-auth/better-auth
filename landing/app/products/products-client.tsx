"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

const ctaHref = `/sign-in?callbackUrl=${encodeURIComponent("/dashboard?redirectTo=/settings/billing")}`;

type Tab = "framework" | "infrastructure";

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
			"Unlimited users",
			"All auth features",
			"User management",
			"Audit log retention (1 day)",
			"1 dashboard seat",
			"10k audit logs/mo included",
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
		price: "$20",
		priceNote: "/mo",
		priceLabel: "$20 / month",
		seats: "Unlimited seats",
		featuresPrefix: "Everything in Starter +",
		features: [
			"Unlimited seats",
			"100k audit logs/mo included",
			"Security detection (1k/mo)",
			"Audit log retention (7 days)",
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
		priceNote: "/mo",
		priceLabel: "$299 / month",
		seats: "Unlimited seats",
		featuresPrefix: "Everything in Pro +",
		features: [
			"Self-service SSO included",
			"500k audit logs/mo included",
			"Security detection (10k/mo)",
			"Audit log retention (30 days)",
			"Log drain",
			"Email & Slack support",
			"Unlimited seats",
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
			"Custom audit logs volume",
			"Custom security detection",
			"Dashboard RBAC",
			"Custom audit log retention",
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

const comparisonRows = [
	{
		label: "Unlimited users",
		starter: true,
		pro: true,
		business: true,
		enterprise: true,
	},
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
		pro: "Unlimited",
		business: "Unlimited",
		enterprise: "Unlimited",
	},
	{
		label: "User management",
		starter: true,
		pro: true,
		business: true,
		enterprise: true,
	},
	{
		label: "Audit logs included",
		starter: "10k/mo",
		pro: "100k/mo",
		business: "500k/mo",
		enterprise: "Custom",
	},
	{
		label: "Additional audit logs",
		starter: false,
		pro: "$5/100k",
		business: "$5/100k",
		enterprise: "Custom",
	},
	{
		label: "Audit log retention",
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
		label: "Additional security detection",
		starter: false,
		pro: "$0.0001/event",
		business: "$0.0001/event",
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
		label: "Custom audit log retention",
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
		label: "Email & Slack support",
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
				<Check className="w-3.5 h-3.5 text-foreground/75 dark:text-foreground/70" />
			</span>
		);
	if (value === false)
		return (
			<span className="inline-flex items-center justify-center w-5 h-5">
				<Minus className="w-3 h-3 text-foreground/40 dark:text-foreground/35" />
			</span>
		);
	return (
		<span className="text-xs text-foreground/80 dark:text-foreground/70 font-mono">
			{value}
		</span>
	);
}

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
					<h1 className="text-lg md:text-xl lg:text-2xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						<span className="underline underline-offset-4 decoration-foreground/30">
							Open Source
						</span>
					</h1>
					<p className="text-[11px] text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[260px]">
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
		{ label: "SSO", value: "Business+" },
	];

	const tiers = [
		{ name: "Starter", price: "$0", note: "/mo" },
		{ name: "Pro", price: "$20", note: "/mo", highlight: true },
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
					<h1 className="text-lg md:text-xl lg:text-2xl text-neutral-800 dark:text-neutral-100 tracking-tight leading-tight">
						<span className="underline underline-offset-4 decoration-foreground/40">
							Infrastructure
						</span>
					</h1>
					<p className="text-[11px] text-foreground/75 dark:text-foreground/65 leading-relaxed max-w-[260px]">
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
			{isHighlighted && (
				<div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-foreground/40 to-transparent" />
			)}

			<div className="flex flex-col flex-1 p-5">
				<div className="flex items-center gap-2 mb-4">
					<h3 className="text-[11px] font-mono uppercase tracking-widest text-foreground/75 dark:text-foreground/65">
						{tier.name}
					</h3>
					{isHighlighted && (
						<span className="text-[9px] font-mono uppercase tracking-widest text-foreground/70 dark:text-foreground/60 border border-dashed border-foreground/20 px-1.5 py-0.5 leading-none">
							popular
						</span>
					)}
				</div>

				<div className="flex items-baseline gap-1.5 mb-3">
					<span
						className={`font-light tracking-tight text-foreground/90 dark:text-foreground/85 ${
							tier.price === "Custom" ? "text-3xl" : "text-4xl tabular-nums"
						}`}
					>
						{tier.price}
					</span>
					{tier.priceNote && (
						<span className="text-[11px] text-foreground/60 dark:text-foreground/50 font-mono">
							{tier.priceNote}
						</span>
					)}
				</div>

				<div className="flex-1 mb-5">
					<p className="text-[10px] text-foreground/65 dark:text-foreground/50 uppercase tracking-widest font-mono mb-3">
						{tier.featuresPrefix}
					</p>
					<ul className="space-y-2.5">
						{tier.features.map((feature) => (
							<li
								key={feature}
								className="flex items-start gap-2 text-[13px] text-foreground/80 dark:text-foreground/70 group-hover:text-foreground/85 dark:group-hover:text-foreground/75 transition-colors duration-300"
							>
								<span className="text-foreground/50 dark:text-foreground/55 mt-0.5 font-mono text-[10px] leading-none select-none shrink-0">
									+
								</span>
								<span>{feature}</span>
							</li>
						))}
					</ul>
				</div>

				<div className="mt-auto">
					<a href={tier.ctaHref} className="block">
						<div
							className={`w-full py-2.5 text-center transition-all duration-200 cursor-pointer ${
								isHighlighted
									? "bg-foreground text-background hover:opacity-90"
									: "border border-dashed border-foreground/[0.14] text-foreground/75 dark:text-foreground/60 hover:text-foreground/85 hover:border-foreground/25 hover:bg-foreground/[0.02]"
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

function FrameworkContent() {
	const frameworkFeatures = [
		{
			category: "Authentication",
			items: [
				"Email & password",
				"Social sign-in (OAuth)",
				"Magic link / OTP",
				"Passkeys (WebAuthn)",
				"Multi-factor authentication",
				"Anonymous sessions",
			],
		},
		{
			category: "Authorization",
			items: [
				"Role-based access control",
				"Organization / teams",
				"Admin management",
				"Session management",
				"Account linking",
				"Impersonation",
			],
		},
		{
			category: "Platform",
			items: [
				"Framework agnostic",
				"20+ database adapters",
				"TypeScript-first",
				"Edge runtime support",
				"Rate limiting",
				"CSRF protection",
			],
		},
	];

	return (
		<div className="px-5 sm:px-6 lg:px-8 pb-32 space-y-8">
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.05 }}
			>
				<p className="text-[13px] text-foreground/55 dark:text-foreground/45 max-w-lg mb-5">
					Everything you need to build production-ready auth. Free and open
					source under the MIT license.
				</p>

				<div className="relative border border-dashed border-foreground/[0.12] bg-foreground/[0.02] overflow-hidden">
					<div className="px-5 py-5">
						<div className="flex items-start justify-between gap-6">
							<div className="space-y-3 flex-1">
								<div className="flex items-center gap-2">
									<h3 className="text-[11px] font-mono uppercase tracking-widest text-foreground/85">
										Community
									</h3>
									<span className="text-[9px] font-mono uppercase tracking-widest text-foreground/75 dark:text-foreground/60 border border-dashed border-foreground/15 px-1.5 py-0.5 leading-none">
										free forever
									</span>
								</div>
								<ul className="space-y-2">
									{[
										"Unlimited users",
										"All auth features",
										"50+ plugins",
										"Self-hosted",
										"MIT license",
									].map((item) => (
										<li
											key={item}
											className="flex items-start gap-2 text-[13px] text-foreground/75 dark:text-foreground/60"
										>
											<span className="text-foreground/50 dark:text-foreground/55 mt-0.5 font-mono text-[10px] leading-none select-none shrink-0">
												+
											</span>
											<span>{item}</span>
										</li>
									))}
								</ul>
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

			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.15 }}
			>
				<p className="text-[11px] uppercase tracking-widest text-foreground/55 dark:text-foreground/40 font-mono mb-5">
					# what&apos;s included
				</p>

				<div className="grid grid-cols-1 sm:grid-cols-3 gap-0">
					{frameworkFeatures.map((group, gi) => (
						<motion.div
							key={group.category}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								duration: 0.3,
								delay: 0.2 + gi * 0.08,
							}}
							className="border border-dashed border-foreground/[0.08] -mt-px -ml-px p-5"
						>
							<h4 className="text-[10px] font-mono uppercase tracking-widest text-foreground/70 dark:text-foreground/50 mb-4">
								{group.category}
							</h4>
							<ul className="space-y-2">
								{group.items.map((item) => (
									<li
										key={item}
										className="flex items-start gap-2 text-[13px] text-foreground/75 dark:text-foreground/60"
									>
										<span className="text-foreground/50 dark:text-foreground/55 mt-0.5 font-mono text-[10px] leading-none select-none shrink-0">
											+
										</span>
										<span>{item}</span>
									</li>
								))}
							</ul>
						</motion.div>
					))}
				</div>
			</motion.div>
		</div>
	);
}

function InfrastructureContent() {
	const tierKeys = ["starter", "pro", "business", "enterprise"] as const;
	const tierLabels = ["Starter", "Pro", "Business", "Enterprise"];

	const capabilities = [
		{
			title: "Dashboard",
			details: [
				"User & session management",
				"Organization overview",
				"Real-time analytics",
				"Team seats & RBAC",
			],
		},
		{
			title: "Audit Logs",
			details: [
				"Automatic event capture",
				"Filterable log explorer",
				"Configurable retention",
				"Log drain to your SIEM",
			],
		},
		{
			title: "Security Detection",
			details: [
				"Bot & abuse detection",
				"IP reputation scoring",
				"Email validation",
				"Behavioral analysis",
			],
		},
		{
			title: "Transactional Comms",
			details: [
				"Email & SMS delivery",
				"Customizable templates",
				"Abuse protection",
				"Delivery tracking",
			],
		},
	];

	return (
		<div className="px-5 sm:px-6 lg:px-8 pb-32 space-y-10">
			{/* Product intro */}
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.05 }}
			>
				<p className="text-[13px] text-foreground/65 dark:text-foreground/55 max-w-lg mb-6">
					Managed infrastructure on top of the open-source framework. Dashboard,
					audit logs, security detection, and more — without building it
					yourself.
				</p>

				{/* Capability cards */}
				<div className="grid grid-cols-2 sm:grid-cols-4 gap-0">
					{capabilities.map((cap, ci) => (
						<motion.div
							key={cap.title}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								duration: 0.3,
								delay: 0.1 + ci * 0.06,
							}}
							className="border border-dashed border-foreground/[0.10] -mt-px -ml-px p-4"
						>
							<h4 className="text-[13px] font-mono uppercase tracking-widest text-foreground/90 dark:text-foreground/85 mb-3">
								{cap.title}
							</h4>
							<ul className="space-y-1.5">
								{cap.details.map((d) => (
									<li
										key={d}
										className="flex items-start gap-2 text-[12px] text-foreground/75 dark:text-foreground/65"
									>
										<span className="text-foreground/50 dark:text-foreground/55 mt-0.5 font-mono text-[10px] leading-none select-none shrink-0">
											+
										</span>
										<span>{d}</span>
									</li>
								))}
							</ul>
						</motion.div>
					))}
				</div>
			</motion.div>

			{/* How it works */}
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.2 }}
			>
				<p className="text-[11px] uppercase tracking-widest text-foreground/60 dark:text-foreground/50 font-mono mb-4">
					# how it works
				</p>
				<div className="flex flex-col sm:flex-row gap-0">
					{[
						{
							step: "01",
							label: "Install the framework",
							desc: "Self-hosted, runs on your database.",
						},
						{
							step: "02",
							label: "Connect to dashboard",
							desc: "One config change to link your instance.",
						},
						{
							step: "03",
							label: "Monitor & manage",
							desc: "Logs, alerts, users, and team access.",
						},
					].map((s, si) => (
						<motion.div
							key={s.step}
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								duration: 0.25,
								delay: 0.25 + si * 0.06,
							}}
							className="flex-1 border border-dashed border-foreground/[0.10] -mt-px -ml-px p-4"
						>
							<span className="text-[10px] font-mono text-foreground/50 dark:text-foreground/45">
								{s.step}
							</span>
							<p className="text-[13px] text-foreground/90 dark:text-foreground/80 mt-1.5 mb-1">
								{s.label}
							</p>
							<p className="text-[11px] text-foreground/60 dark:text-foreground/50 leading-relaxed">
								{s.desc}
							</p>
						</motion.div>
					))}
				</div>
			</motion.div>

			{/* Divider into plans */}
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.3, delay: 0.3 }}
				className="relative flex items-center gap-4"
			>
				<div className="flex-1 h-px bg-foreground/[0.12]" />
				<p className="text-[10px] font-mono uppercase tracking-widest text-foreground/55 dark:text-foreground/45 shrink-0">
					Plans
				</p>
				<div className="flex-1 h-px bg-foreground/[0.12]" />
			</motion.div>

			{/* Pricing cards */}
			<motion.div
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.4, delay: 0.35 }}
			>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0">
					{pricingTiers.map((tier, index) => (
						<PricingCard key={tier.name} tier={tier} index={index} />
					))}
				</div>

				<div className="mt-4 px-1">
					<p className="text-xs text-foreground/55 dark:text-foreground/45 leading-relaxed">
						<span className="text-foreground/70 dark:text-foreground/60 font-mono uppercase tracking-wider">
							What&apos;s an audit log?
						</span>{" "}
						Any auth action tracked by the dashboard &mdash; sign-ins, password
						resets, OTP checks, etc. Each action counts as one log.
					</p>
				</div>
			</motion.div>

			{/* Feature comparison */}
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.45 }}
			>
				<p className="text-[11px] uppercase tracking-widest text-foreground/60 dark:text-foreground/50 font-mono mb-5">
					# feature comparison
				</p>

				<div className="border border-dashed border-foreground/[0.10] overflow-x-auto">
					<table className="w-full min-w-[600px]">
						<thead>
							<tr className="border-b border-foreground/[0.10]">
								<th className="text-left text-[11px] uppercase tracking-widest text-foreground/70 dark:text-foreground/55 font-mono font-normal py-3 px-5 w-[28%]">
									Feature
								</th>
								{tierLabels.map((name) => (
									<th
										key={name}
										className={`text-center text-[11px] uppercase tracking-widest font-mono font-normal py-3 px-3 w-[18%] ${
											name === "Pro"
												? "text-foreground/85 dark:text-foreground/75 bg-foreground/[0.03]"
												: "text-foreground/70 dark:text-foreground/55"
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
									className={`border-b border-dashed border-foreground/[0.06] last:border-0 transition-colors duration-150 hover:bg-foreground/[0.02] ${
										i % 2 === 0 ? "bg-foreground/[0.012]" : ""
									}`}
								>
									<td className="text-[13px] text-foreground/85 dark:text-foreground/70 py-2.5 px-5">
										{row.label}
									</td>
									{tierKeys.map((tier) => (
										<td
											key={tier}
											className={`text-center py-2.5 px-3 ${
												tier === "pro" ? "bg-foreground/[0.03]" : ""
											}`}
										>
											<ComparisonCell value={row[tier] as string | boolean} />
										</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</motion.div>
		</div>
	);
}

export function ProductsPageClient() {
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const initialTab: Tab =
		tabParam === "infrastructure" ? "infrastructure" : "framework";
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);

	useEffect(() => {
		const next: Tab =
			tabParam === "infrastructure" ? "infrastructure" : "framework";
		setActiveTab(next);
	}, [tabParam]);

	return (
		<div className="relative h-full overflow-x-hidden">
			<div className="relative text-foreground h-full">
				<div className="flex flex-col lg:flex-row h-full">
					{/* Left side — Hero */}
					<div className="hidden lg:block relative w-full lg:w-[30%] border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<AnimatePresence mode="wait">
							{activeTab === "framework" ? (
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
							) : (
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
							)}
						</AnimatePresence>
					</div>

					{/* Right side — Content */}
					<div className="relative w-full lg:w-[70%] overflow-y-auto overflow-x-hidden no-scrollbar">
						<div className="px-5 sm:px-6 lg:px-8 pt-16 lg:pt-16 pb-4">
							<AnimatePresence mode="wait">
								<motion.h2
									key={activeTab}
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.2 }}
									className="text-base text-foreground/90 tracking-tight"
								>
									{activeTab === "framework"
										? "Better Auth Framework"
										: "Infrastructure"}
								</motion.h2>
							</AnimatePresence>
						</div>

						<AnimatePresence mode="wait">
							{activeTab === "framework" ? (
								<motion.div
									key="framework-content"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.25 }}
								>
									<FrameworkContent />
								</motion.div>
							) : (
								<motion.div
									key="infrastructure-content"
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.25 }}
								>
									<InfrastructureContent />
								</motion.div>
							)}
						</AnimatePresence>
					</div>
				</div>
			</div>
		</div>
	);
}
