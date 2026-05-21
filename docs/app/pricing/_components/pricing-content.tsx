"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Check, Gauge, Headset, Info, Layers2, Minus } from "lucide-react";
import { Fragment, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const proCheckoutHref = `https://dash.better-auth.com/sign-in?callbackUrl=${encodeURIComponent(
	"/?redirectTo=/settings/billing",
)}`;

type Tier = {
	name: string;
	price: string;
	priceUnit: string | null;
	tagline: string;
	features: readonly (string | readonly [string, string])[];
	cta: { label: string; href: string };
	highlighted: boolean;
};

const tiers: readonly Tier[] = [
	{
		name: "Starter",
		price: "$0",
		priceUnit: "/ month",
		tagline: "For evaluation and side projects.",
		features: [
			"1 dashboard seat",
			["10,000 audit logs / month", "1 day retention"],
			"1,000 security detections / month",
			"Community support",
		],
		cta: {
			label: "Get Started",
			href: "https://dash.better-auth.com/sign-in",
		},
		highlighted: false,
	},
	{
		name: "Pro",
		price: "$20",
		priceUnit: "/ month",
		tagline: "For production teams running auth in the critical path.",
		features: [
			"Unlimited seats",
			["20,000 audit logs / month", "then $0.0001 per event"],
			["10,000 security detections / month", "then $0.001 per event"],
			[
				"Self-service SSO & Directory Sync",
				"1 connection, then $50/month per connection",
			],
			["Transactional email & SMS", "$0.001 per email, $0.09 per SMS"],
			"Email templates & abuse protection",
			"Email support",
		],
		cta: {
			label: "Select Plan",
			href: proCheckoutHref,
		},
		highlighted: true,
	},
	{
		name: "Enterprise",
		price: "Custom",
		priceUnit: null,
		tagline: "For organizations with bespoke security or volume needs.",
		features: [
			"Custom usage and retention",
			"Custom domain and log drain included",
			"Dashboard RBAC",
			"Slack support and implementation help",
			"Custom MSA and DPA",
		],
		cta: {
			label: "Contact Us",
			href: "/enterprise",
		},
		highlighted: false,
	},
];

type CellValue =
	| boolean
	| string
	| readonly [string, string]
	| { addon: string };

type CompareRow = {
	label: string;
	tip?: string;
	values: readonly [CellValue, CellValue, CellValue];
};

type CompareSection = {
	title: string;
	icon: LucideIcon;
	rows: readonly CompareRow[];
};

const compareSections: readonly CompareSection[] = [
	{
		title: "Usage",
		icon: Gauge,
		rows: [
			{ label: "Dashboard seats", values: ["1", "Unlimited", "Unlimited"] },
			{
				label: "Audit log",
				values: [
					"10,000 / month",
					["20,000 / month", "then $0.0001 / event"],
					"Custom",
				],
			},
			{ label: "Audit log retention", values: ["1 day", "7 days", "Custom"] },
			{
				label: "Security detection",
				values: [
					"1,000 / month",
					["10,000 / month", "then $0.001 / event"],
					"Custom",
				],
			},
			{
				label: "Transactional Email",
				tip: "Charged only when using the built-in email provider. Free if you bring your own SMTP or provider.",
				values: [false, "$0.001 / email", "Custom"],
			},
			{
				label: "Transactional SMS",
				tip: "Charged only when using the built-in SMS provider. Free if you bring your own provider.",
				values: [false, "$0.09 / SMS", "Custom"],
			},
			{
				label: "Self-service SSO",
				values: [
					false,
					["1 connection", "then $50/month per connection"],
					"Custom",
				],
			},
			{
				label: "Directory Sync",
				values: [
					false,
					["1 connection", "then $50/month per connection"],
					"Custom",
				],
			},
		],
	},
	{
		title: "Features",
		icon: Layers2,
		rows: [
			{ label: "User management", values: [true, true, true] },
			{ label: "Audit log", values: [true, true, true] },
			{ label: "Security detection", values: [true, true, true] },
			{ label: "Abuse protection", values: [false, true, true] },
			{ label: "Transactional Email & SMS", values: [false, true, true] },
			{ label: "Email templates", values: [false, true, true] },
			{ label: "Self-service SSO", values: [false, true, true] },
			{ label: "Directory Sync", values: [false, true, true] },
			{ label: "Dashboard RBAC", values: [false, true, true] },
			{
				label: "Custom domain for Dashboard",
				values: [false, { addon: "$25 / month" }, true],
			},
			{ label: "Log drain", values: [false, { addon: "$25 / month" }, true] },
		],
	},
	{
		title: "Support",
		icon: Headset,
		rows: [
			{ label: "Community", values: [true, true, true] },
			{ label: "Email", values: [false, true, true] },
			{ label: "Slack", values: [false, false, true] },
			{ label: "Implementation assistance", values: [false, false, true] },
		],
	},
];

const tierNames = ["Starter", "Pro", "Enterprise"] as const;
type TierName = (typeof tierNames)[number];

function TierCard({ tier, index }: { tier: Tier; index: number }) {
	const { highlighted } = tier;

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3, delay: 0.1 + index * 0.05, ease: "easeOut" }}
			className={cn(
				"relative flex flex-col bg-background mx-auto max-w-md w-full",
				"border border-foreground/10 lg:border-l-0 lg:border-r-0 first:lg:border-l last:lg:border-r",
				highlighted &&
					"lg:border! lg:border-foreground/25! lg:-my-4 lg:z-10 bg-muted/30",
			)}
		>
			<div className="flex flex-col flex-1 px-6 pt-6 pb-6">
				<h3 className="text-base text-foreground mb-1">{tier.name}</h3>
				<p className="text-[13px] text-foreground/60 leading-relaxed mb-5 min-h-[2.5em]">
					{tier.tagline}
				</p>

				<div className="flex items-baseline gap-1.5 pb-5 mb-5 border-b border-foreground/10">
					<span
						className={cn(
							"font-light tracking-tight text-foreground tabular-nums",
							tier.price === "Custom" ? "text-3xl" : "text-4xl",
						)}
					>
						{tier.price}
					</span>
					{tier.priceUnit && (
						<span className="text-[13px] text-foreground/55">
							{tier.priceUnit}
						</span>
					)}
				</div>

				<ul className="flex-1 space-y-3 mb-6 text-[13px]">
					{tier.features.map((feature) => {
						const [primary, sub] = Array.isArray(feature)
							? feature
							: [feature as string, null];
						return (
							<li key={primary} className="flex flex-col">
								<div className="flex items-start gap-2.5">
									<Check
										className="w-3.5 h-3.5 mt-[3px] shrink-0 text-foreground/70"
										strokeWidth={2.5}
									/>
									<span className="text-foreground/85">{primary}</span>
								</div>
								{sub && (
									<span className="ml-[22px] text-foreground/50">{sub}</span>
								)}
							</li>
						);
					})}
				</ul>

				<a href={tier.cta.href} className="block mt-auto">
					<div
						className={cn(
							"w-full py-2.5 text-center text-[13px] rounded-sm transition-all duration-200",
							highlighted
								? "bg-foreground text-background hover:opacity-90"
								: "border border-foreground/15 text-foreground/85 hover:bg-foreground/5 hover:border-foreground/25",
						)}
					>
						{tier.cta.label}
					</div>
				</a>
			</div>
		</motion.div>
	);
}

function CompareCell({ value }: { value: CellValue }) {
	if (value === true) {
		return (
			<Check
				className="inline-block w-4 h-4 text-foreground/75"
				strokeWidth={2.5}
			/>
		);
	}
	if (value === false) {
		return <Minus className="inline-block w-3.5 h-3.5 text-foreground/30" />;
	}
	if (typeof value === "string") {
		return <span className="text-[13px] text-foreground/85">{value}</span>;
	}
	if (Array.isArray(value)) {
		return (
			<span className="flex flex-col">
				<span className="text-[13px] text-foreground/85">{value[0]}</span>
				<span className="text-[12px] text-foreground/50 leading-tight">
					{value[1]}
				</span>
			</span>
		);
	}
	const addon = (value as { addon: string }).addon;
	return (
		<span className="flex flex-col">
			<span className="text-[13px] text-foreground/85">{addon}</span>
			<span className="text-[12px] text-foreground/50 leading-tight">
				add-on
			</span>
		</span>
	);
}

function RowLabel({ row }: { row: CompareRow }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			{row.label}
			{row.tip && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={`More info about ${row.label}`}
							className="inline-flex items-center text-foreground/40 hover:text-foreground/70 transition-colors cursor-help"
						>
							<Info className="w-3.5 h-3.5" strokeWidth={1.75} />
						</button>
					</TooltipTrigger>
					<TooltipContent
						side="top"
						className="max-w-[260px] text-[12px] leading-relaxed"
					>
						{row.tip}
					</TooltipContent>
				</Tooltip>
			)}
		</span>
	);
}

function SectionHeaderRow({
	section,
	colSpan,
	withTopBorder,
}: {
	section: CompareSection;
	colSpan: number;
	withTopBorder: boolean;
}) {
	const Icon = section.icon;
	return (
		<tr>
			<th
				colSpan={colSpan}
				scope="colgroup"
				className={cn(
					"text-left text-[14px] text-foreground font-normal py-3 px-5 border-b border-foreground/10",
					withTopBorder && "border-t border-foreground/10",
				)}
			>
				<span className="inline-flex items-center gap-2">
					<Icon className="w-4 h-4 text-foreground/70" strokeWidth={1.75} />
					{section.title}
				</span>
			</th>
		</tr>
	);
}

function CompareTableDesktop() {
	return (
		<div className="hidden lg:block border border-foreground/10 rounded-sm">
			<div
				aria-hidden="true"
				className="sticky top-(--landing-topbar-height) z-10 grid grid-cols-[34%_22%_22%_22%] bg-background border-b border-foreground/10"
			>
				<div />
				{tierNames.map((name) => (
					<div
						key={name}
						className="text-left text-sm font-medium py-5 px-5 text-foreground"
					>
						{name}
					</div>
				))}
			</div>
			<table className="w-full table-fixed border-collapse">
				<colgroup>
					<col className="w-[34%]" />
					<col className="w-[22%]" />
					<col className="w-[22%]" />
					<col className="w-[22%]" />
				</colgroup>
				<thead className="sr-only">
					<tr>
						<th scope="col">Feature</th>
						{tierNames.map((name) => (
							<th key={name} scope="col">
								{name}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{compareSections.map((section, sIdx) => (
						<Fragment key={section.title}>
							<SectionHeaderRow
								section={section}
								colSpan={4}
								withTopBorder={sIdx > 0}
							/>
							{section.rows.map((row) => (
								<tr
									key={`${section.title}-${row.label}`}
									className="border-b border-foreground/6 last:border-b-0"
								>
									<td className="text-[13px] text-foreground/85 py-3 px-5 align-top">
										<RowLabel row={row} />
									</td>
									{row.values.map((cell, idx) => (
										<td
											key={`${row.label}-${tierNames[idx]}`}
											className="py-3 px-5 align-top"
										>
											<CompareCell value={cell} />
										</td>
									))}
								</tr>
							))}
						</Fragment>
					))}
				</tbody>
			</table>
		</div>
	);
}

function CompareTableMobile() {
	const [selected, setSelected] = useState<TierName>("Pro");
	const planIdx = tierNames.indexOf(selected);
	const selectedTier = tiers[planIdx];

	return (
		<div className="lg:hidden max-w-xl mx-auto">
			<div className="sticky top-(--landing-topbar-height) z-10 bg-background py-4 flex items-center justify-between gap-3">
				<Select
					value={selected}
					onValueChange={(v) => setSelected(v as TierName)}
				>
					<SelectTrigger
						aria-label="Select plan to compare"
						className="rounded-sm w-fit min-w-[140px] font-medium"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent className="rounded-sm font-medium">
						{tierNames.map((name) => (
							<SelectItem key={name} value={name} className="rounded-sm">
								{name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				<a
					href={selectedTier.cta.href}
					className="shrink-0 inline-flex items-center px-4 h-9 text-[13px] bg-foreground text-background rounded-sm hover:opacity-90 transition-all"
				>
					{selectedTier.cta.label}
				</a>
			</div>

			<div className="border border-foreground/10 rounded-sm overflow-hidden">
				<table className="w-full table-fixed border-collapse">
					<thead className="sr-only">
						<tr>
							<th scope="col">Feature</th>
							<th scope="col">{selected}</th>
						</tr>
					</thead>
					<tbody>
						{compareSections.map((section, sIdx) => (
							<Fragment key={section.title}>
								<SectionHeaderRow
									section={section}
									colSpan={2}
									withTopBorder={sIdx > 0}
								/>
								{section.rows.map((row) => (
									<tr
										key={`${section.title}-${row.label}`}
										className="border-b border-foreground/6 last:border-b-0"
									>
										<td className="text-[13px] text-foreground/85 py-3 px-4 align-top w-[58%]">
											<RowLabel row={row} />
										</td>
										<td className="py-3 px-4 align-top text-right">
											<CompareCell value={row.values[planIdx]} />
										</td>
									</tr>
								))}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function CompareTable() {
	return (
		<TooltipProvider delayDuration={150}>
			<CompareTableDesktop />
			<CompareTableMobile />
		</TooltipProvider>
	);
}

export function PricingContent() {
	return (
		<div className="px-5 sm:px-6 lg:px-8 pb-20 space-y-14">
			{/* OSS framework note */}
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.05 }}
				className="flex items-center gap-4 px-5 py-3.5 border border-foreground/10 rounded-sm bg-foreground/2"
			>
				<p className="flex-1 text-[13px] text-foreground/75 leading-relaxed">
					The Better Auth framework is{" "}
					<span className="text-foreground">free and open source</span>. Pricing
					below is for our managed infrastructure.
				</p>
				<a
					href="/docs"
					className="group shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-foreground/85 border border-foreground/15 rounded-sm hover:border-foreground/30 hover:bg-foreground/5 transition-all"
				>
					Docs
					<svg
						className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
						viewBox="0 0 10 10"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M1 9L9 1M9 1H3M9 1V7"
							stroke="currentColor"
							strokeWidth="1.3"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</a>
			</motion.div>

			{/* Tier cards — connected panel */}
			<section>
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-0">
					{tiers.map((tier, index) => (
						<TierCard key={tier.name} tier={tier} index={index} />
					))}
				</div>
			</section>

			{/* Comparison table */}
			<motion.section
				aria-label="Plan comparison"
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.3 }}
			>
				<CompareTable />
			</motion.section>
		</div>
	);
}
