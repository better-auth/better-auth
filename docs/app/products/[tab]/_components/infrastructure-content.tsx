"use client";

import { motion } from "framer-motion";
import { Check, Minus } from "lucide-react";

const ctaHref = `https://dash.better-auth.com/sign-in?callbackUrl=${encodeURIComponent("/?redirectTo=/settings/billing")}`;

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
		ctaHref: "https://dash.better-auth.com/sign-in",
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
			"20k audit logs/mo included",
			"Security detection (10k/mo)",
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
		name: "Enterprise",
		filename: "enterprise-plan",
		price: "Custom",
		priceNote: null,
		priceLabel: "Custom pricing",
		seats: "Unlimited seats",
		featuresPrefix: "Everything in Pro +",
		features: [
			"Self-service SSO included",
			"Custom audit logs volume",
			"Custom security detection",
			"Custom audit log retention",
			"Log drain",
			"Custom domain",
			"Email & Slack support",
			"Dashboard RBAC",
			"Advanced support",
		],
		cta: "Contact Us",
		ctaHref: "/enterprise",
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
		enterprise: true,
	},
	{
		label: "All auth features",
		starter: true,
		pro: true,
		enterprise: true,
	},
	{
		label: "Dashboard seats",
		starter: "1",
		pro: "Unlimited",
		enterprise: "Unlimited",
	},
	{
		label: "User management",
		starter: true,
		pro: true,
		enterprise: true,
	},
	{
		label: "Audit logs included",
		starter: "10k/mo",
		pro: "20k/mo",
		enterprise: "Custom",
	},
	{
		label: "Additional audit logs",
		starter: false,
		pro: "$5/100k",
		enterprise: "Custom",
	},
	{
		label: "Audit log retention",
		starter: "1 day",
		pro: "7 days",
		enterprise: "Custom",
	},
	{
		label: "Security detection",
		starter: "1k/mo",
		pro: "10k/mo",
		enterprise: "Custom",
	},
	{
		label: "Additional security detection",
		starter: false,
		pro: "$0.001/event",
		enterprise: "Custom",
	},
	{
		label: "Transactional email & SMS",
		starter: false,
		pro: true,
		enterprise: true,
	},
	{
		label: "Email templates & abuse protection",
		starter: false,
		pro: true,
		enterprise: true,
	},
	{
		label: "Self-service SSO",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Dashboard RBAC",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Custom audit log retention",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Log drain",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Custom domain",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Community support",
		starter: true,
		pro: true,
		enterprise: true,
	},
	{
		label: "Email & Slack support",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Implementation assistance",
		starter: false,
		pro: false,
		enterprise: true,
	},
	{
		label: "Advanced support",
		starter: false,
		pro: false,
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

export function InfrastructureContent() {
	const tierKeys = ["starter", "pro", "enterprise"] as const;
	const tierLabels = ["Starter", "Pro", "Enterprise"];

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
			title: "Enterprise",
			details: [
				"Self-service SSO",
				"SCIM provisioning",
				"Directory sync",
				"Role-based access",
			],
		},
	];

	return (
		<div className="px-5 sm:px-6 lg:px-8 pb-16 space-y-10">
			{/* Product intro */}
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.05 }}
			>
				<p className="text-sm sm:text-[15px] text-foreground/80 leading-relaxed max-w-lg mb-8">
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
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-0">
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
