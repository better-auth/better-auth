"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

const roles = [
	{
		title: "Founding Design Engineer",
		type: "Full-time",
		location: "San Francisco",
		description:
			"Craft the visual identity and UI of Better Auth's products — dashboard, docs, landing pages. You'll own design end-to-end.",
		requirements: [
			"Strong portfolio with shipped product work",
			"React / Next.js proficiency",
			"CSS mastery and responsive design",
			"Eye for detail and micro-interactions",
			"Experience shipping design systems",
		],
	},
	{
		title: "Senior Developer Relations",
		type: "Full-time",
		location: "San Francisco",
		description:
			"Be the bridge between Better Auth and its developer community. Create content, speak at events, build demos, and shape the developer experience.",
		requirements: [
			"Developer background with public repos or OSS contributions",
			"Content creation experience (blogs, videos, tutorials)",
			"Public speaking and conference experience",
			"Community building track record",
			"Familiarity with auth / security space",
		],
	},
];

function ApplyDialog({
	role,
	onClose,
}: {
	role: (typeof roles)[number];
	onClose: () => void;
}) {
	const [submitted, setSubmitted] = useState(false);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15 }}
			className="fixed inset-0 z-[100] flex items-center justify-center p-4"
			onClick={onClose}
		>
			{/* Backdrop */}
			<div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

			{/* Dialog */}
			<motion.div
				initial={{ opacity: 0, y: 10, scale: 0.98 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				exit={{ opacity: 0, y: 10, scale: 0.98 }}
				transition={{ duration: 0.2, ease: "easeOut" }}
				onClick={(e) => e.stopPropagation()}
				className="relative w-full max-w-md border border-dashed border-foreground/[0.08] bg-background overflow-hidden"
			>
				{/* Corner marks */}
				<span className="absolute top-2 left-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
					+
				</span>
				<span className="absolute top-2 right-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
					+
				</span>
				<span className="absolute bottom-2 left-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
					+
				</span>
				<span className="absolute bottom-2 right-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
					+
				</span>

				<div className="p-6 sm:p-8">
					{/* Close button */}
					<button
						type="button"
						onClick={onClose}
						className="absolute top-4 right-4 text-foreground/30 hover:text-foreground/60 transition-colors"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
						>
							<path
								fill="currentColor"
								d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12z"
							/>
						</svg>
					</button>

					{submitted ? (
						<motion.div
							initial={{ opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.3 }}
							className="text-center py-6 space-y-3"
						>
							<p className="text-sm text-foreground/80">Application sent</p>
							<p className="text-[11px] text-foreground/40 leading-relaxed max-w-xs mx-auto">
								Thanks for applying for {role.title}. We&apos;ll review your
								application and get back to you soon.
							</p>
							<button
								type="button"
								onClick={onClose}
								className="mt-4 inline-flex items-center px-4 py-2 border border-foreground/[0.12] text-foreground/40 hover:text-foreground/70 hover:border-foreground/25 transition-all font-mono text-[10px] uppercase tracking-widest"
							>
								Close
							</button>
						</motion.div>
					) : (
						<>
							<div className="mb-6 space-y-1">
								<p className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono">
									# Apply
								</p>
								<h3 className="text-sm text-foreground/80">{role.title}</h3>
								<div className="flex items-center gap-2 pt-1">
									<span className="text-[8px] font-mono uppercase tracking-widest text-foreground/40 border border-dashed border-foreground/[0.1] px-1.5 py-0.5 leading-none">
										{role.type}
									</span>
									<span className="text-[8px] font-mono uppercase tracking-widest text-foreground/40 border border-dashed border-foreground/[0.1] px-1.5 py-0.5 leading-none">
										{role.location}
									</span>
								</div>
							</div>

							<form
								onSubmit={(e) => {
									e.preventDefault();
									setSubmitted(true);
								}}
								className="space-y-4"
							>
								<div className="space-y-1.5">
									<label
										htmlFor="careers-name"
										className="text-[9px] text-foreground/30 uppercase tracking-widest font-mono"
									>
										Name
									</label>
									<input
										id="careers-name"
										type="text"
										required
										className="w-full bg-transparent border border-dashed border-foreground/[0.1] px-3 py-2 text-[12px] text-foreground/70 placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
										placeholder="Your full name"
									/>
								</div>

								<div className="space-y-1.5">
									<label
										htmlFor="careers-email"
										className="text-[9px] text-foreground/30 uppercase tracking-widest font-mono"
									>
										Email
									</label>
									<input
										id="careers-email"
										type="email"
										required
										className="w-full bg-transparent border border-dashed border-foreground/[0.1] px-3 py-2 text-[12px] text-foreground/70 placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
										placeholder="you@example.com"
									/>
								</div>

								<div className="space-y-1.5">
									<label
										htmlFor="careers-portfolio"
										className="text-[9px] text-foreground/30 uppercase tracking-widest font-mono"
									>
										Portfolio / GitHub
									</label>
									<input
										id="careers-portfolio"
										type="url"
										required
										className="w-full bg-transparent border border-dashed border-foreground/[0.1] px-3 py-2 text-[12px] text-foreground/70 placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors"
										placeholder="https://"
									/>
								</div>

								<div className="space-y-1.5">
									<label
										htmlFor="careers-why"
										className="text-[9px] text-foreground/30 uppercase tracking-widest font-mono"
									>
										Why Better Auth?
									</label>
									<textarea
										id="careers-why"
										required
										rows={3}
										className="w-full bg-transparent border border-dashed border-foreground/[0.1] px-3 py-2 text-[12px] text-foreground/70 placeholder:text-foreground/20 focus:outline-none focus:border-foreground/25 transition-colors resize-none"
										placeholder="Tell us why you want to join..."
									/>
								</div>

								<div className="pt-2">
									<button
										type="submit"
										className="inline-flex items-center gap-1.5 px-4 py-2 border border-foreground/[0.12] text-foreground/40 hover:text-foreground/70 hover:border-foreground/25 hover:bg-foreground/[0.02] transition-all"
									>
										<span className="font-mono text-[10px] uppercase tracking-widest">
											Submit Application
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
									</button>
								</div>
							</form>
						</>
					)}
				</div>
			</motion.div>
		</motion.div>
	);
}

function CareersHero() {
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
						Careers
					</h1>
					<p className="text-[11px] text-foreground/40 leading-relaxed max-w-[260px]">
						Help us build the future of authentication.
					</p>
				</div>

				{/* Quick stats */}
				<div className="border-t border-foreground/10 pt-4 space-y-0">
					{[
						{ label: "Location", value: "San Francisco" },
						{ label: "Team size", value: "8" },
						{ label: "Open roles", value: `${roles.length}` },
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

				{/* Contact link */}
				<div className="flex items-center gap-3 pt-1">
					<a
						href="mailto:careers@better-auth.com"
						className="inline-flex items-center gap-1.5 text-[12px] text-foreground/40 hover:text-foreground/70 font-mono uppercase tracking-wider transition-colors"
					>
						careers@better-auth.com
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
					</a>
				</div>
			</div>
		</motion.div>
	);
}

function RoleCard({
	role,
	index,
	onApply,
}: {
	role: (typeof roles)[number];
	index: number;
	onApply: () => void;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.3,
				delay: 0.2 + index * 0.08,
				ease: "easeOut",
			}}
			className="relative border border-dashed border-foreground/[0.08] hover:border-foreground/[0.14] transition-all duration-300 group"
		>
			{/* Corner marks */}
			<span className="absolute top-2 left-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
				+
			</span>
			<span className="absolute top-2 right-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
				+
			</span>
			<span className="absolute bottom-2 left-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
				+
			</span>
			<span className="absolute bottom-2 right-2 text-[9px] font-mono text-foreground/15 select-none leading-none">
				+
			</span>

			<div className="p-5 sm:p-6 space-y-4">
				{/* Header */}
				<div className="space-y-3">
					<h3 className="text-sm sm:text-base text-foreground/90 tracking-tight">
						{role.title}
					</h3>
					<div className="flex items-center gap-2">
						<span className="text-[8px] font-mono uppercase tracking-widest text-foreground/40 border border-dashed border-foreground/[0.1] px-1.5 py-0.5 leading-none">
							{role.type}
						</span>
						<span className="text-[8px] font-mono uppercase tracking-widest text-foreground/40 border border-dashed border-foreground/[0.1] px-1.5 py-0.5 leading-none">
							{role.location}
						</span>
					</div>
				</div>

				{/* Description */}
				<p className="text-[11px] text-foreground/50 leading-relaxed max-w-lg">
					{role.description}
				</p>

				{/* Divider */}
				<div className="border-t border-dashed border-foreground/[0.06]" />

				{/* Requirements */}
				<div>
					<p className="text-[9px] text-foreground/30 uppercase tracking-widest font-mono mb-3">
						Requirements
					</p>
					<ul className="space-y-2">
						{role.requirements.map((req) => (
							<li
								key={req}
								className="flex items-start gap-2 text-[11px] text-foreground/45 group-hover:text-foreground/55 transition-colors duration-300"
							>
								<span className="text-foreground/50 mt-px font-mono text-[9px] leading-none select-none shrink-0">
									+
								</span>
								<span>{req}</span>
							</li>
						))}
					</ul>
				</div>

				{/* Apply CTA */}
				<div className="pt-2">
					<button
						type="button"
						onClick={onApply}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-foreground/[0.12] text-foreground/40 hover:text-foreground/70 hover:border-foreground/25 hover:bg-foreground/[0.02] transition-all cursor-pointer"
					>
						<span className="font-mono text-[10px] uppercase tracking-widest">
							Apply
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
					</button>
				</div>
			</div>
		</motion.div>
	);
}

export function CareersPageClient() {
	const [applyingRole, setApplyingRole] = useState<
		(typeof roles)[number] | null
	>(null);

	return (
		<div className="relative min-h-dvh overflow-x-hidden pt-14 lg:h-dvh lg:overflow-hidden lg:pt-0">
			<div className="relative text-foreground lg:h-full">
				<div className="flex flex-col lg:h-full lg:flex-row">
					{/* Left side */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-full border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<CareersHero />
					</div>

					{/* Right side */}
					<div className="relative w-full lg:w-[70%] lg:h-full lg:overflow-y-auto overflow-x-hidden no-scrollbar">
						<div className="p-5 sm:p-6 lg:p-8 pt-8 lg:pt-16 pb-32 space-y-10">
							{/* Mobile header */}
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
										d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2m-6 0h-4V4h4z"
									/>
								</svg>
								<span className="text-sm text-foreground/60">Careers</span>
							</div>

							{/* Section: Why Better Auth */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
							>
								<p className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-5">
									# Why Better Auth
								</p>

								<div className="relative border border-dashed border-foreground/[0.08] overflow-hidden">
									<div className="px-5 py-5 sm:px-8 sm:py-8 space-y-5 max-w-2xl">
										<p className="text-[13px] text-foreground/60 leading-relaxed">
											Better Auth is the{" "}
											<span className="text-foreground/80">
												fastest-growing open-source authentication framework
											</span>{" "}
											for the web. We&apos;re a small, focused team shaping how
											auth works for millions of developers.
										</p>

										<p className="text-[13px] text-foreground/60 leading-relaxed">
											Every line of code we write gets used in production by
											thousands of projects &mdash; from solo indie hackers to
											large-scale enterprises. The work here has{" "}
											<span className="text-foreground/80">
												outsized impact
											</span>
											.
										</p>

										<p className="text-[13px] text-foreground/60 leading-relaxed">
											We work in the open, move fast, and care deeply about
											developer experience. If you want to do the best work of
											your career on a problem that matters, we&apos;d love to
											hear from you.
										</p>
									</div>
								</div>
							</motion.div>

							{/* Section: Open positions */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.15 }}
							>
								<p className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-5">
									# Open positions
								</p>

								<div className="space-y-0">
									{roles.map((role, i) => (
										<RoleCard
											key={role.title}
											role={role}
											index={i}
											onApply={() => setApplyingRole(role)}
										/>
									))}
								</div>
							</motion.div>
						</div>
					</div>
				</div>
			</div>

			{/* Apply dialog */}
			<AnimatePresence>
				{applyingRole && (
					<ApplyDialog
						role={applyingRole}
						onClose={() => setApplyingRole(null)}
					/>
				)}
			</AnimatePresence>
		</div>
	);
}
