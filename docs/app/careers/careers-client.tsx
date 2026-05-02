"use client";

import { motion } from "framer-motion";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import type { GemJobPost } from "@/lib/gem";
import { formatGemEnum } from "@/lib/gem";

type Role = Omit<GemJobPost, "content" | "content_plain">;

function CareersHero({ openRoles }: { openRoles: number }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full"
		>
			<div className="space-y-6">
				<div className="space-y-2">
					<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight text-balance">
						Join the team
					</h1>
					<p className="text-base text-foreground/70 dark:text-foreground/50 leading-relaxed">
						Help us build the future of authentication.
					</p>
				</div>

				{/* Quick stats */}
				<div className="border-t border-foreground/10 pt-4 space-y-0">
					{[
						{ label: "Location", value: "San Francisco" },
						{ label: "Open Positions", value: `${openRoles}` },
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
							<span className="text-sm text-foreground/70 dark:text-foreground/50 uppercase tracking-wider">
								{item.label}
							</span>
							<span className="text-sm text-foreground/85 dark:text-foreground/75 font-mono">
								{item.value}
							</span>
						</motion.div>
					))}
				</div>

				{/* Contact link */}
				<div className="flex items-center gap-3 pt-1">
					<a
						href="mailto:careers@better-auth.com"
						className="inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-foreground/70 font-mono tracking-wider transition-colors"
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

function groupByDepartment(roles: Role[]): [string, Role[]][] {
	const groups = new Map<string, Role[]>();
	for (const role of roles) {
		const dept = role.departments[0]?.name ?? "Other";
		const existing = groups.get(dept);
		if (existing) existing.push(role);
		else groups.set(dept, [role]);
	}
	return Array.from(groups);
}

function RoleRow({ role, index }: { role: Role; index: number }) {
	const location =
		role.location_type === "remote"
			? "Remote"
			: (role.location?.name ?? formatGemEnum(role.location_type));
	const meta = [location, formatGemEnum(role.employment_type)]
		.filter(Boolean)
		.join(" · ");

	return (
		<motion.a
			href={role.absolute_url}
			target="_blank"
			rel="noopener noreferrer"
			initial={{ opacity: 0, y: 4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.25,
				delay: 0.05 + index * 0.04,
				ease: "easeOut",
			}}
			className="group flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 sm:gap-6 border-b border-dashed border-foreground/[0.08] dark:border-white/[0.06] py-4 last:border-0 transition-colors"
		>
			{/* Title row (with mobile arrow on the right) */}
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-[15px] sm:text-base text-foreground/85 dark:text-foreground/75 group-hover:text-foreground dark:group-hover:text-foreground/95 transition-colors">
					{role.title}
				</span>
				<svg
					className="sm:hidden h-2.5 w-2.5 shrink-0 text-foreground/30 group-hover:text-foreground/70 group-hover:translate-x-0.5 transition-all"
					viewBox="0 0 10 10"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M1 9L9 1M9 1H3M9 1V7"
						stroke="currentColor"
						strokeWidth="1.2"
					/>
				</svg>
			</div>

			{/* Meta (with desktop arrow inline) */}
			<div className="flex items-baseline gap-3 sm:shrink-0">
				<span className="text-[12px] text-foreground/45 dark:text-foreground/35 group-hover:text-foreground/70 dark:group-hover:text-foreground/55 transition-colors sm:text-right">
					{meta}
				</span>
				<svg
					className="hidden sm:block h-2.5 w-2.5 text-foreground/30 group-hover:text-foreground/70 group-hover:translate-x-0.5 transition-all"
					viewBox="0 0 10 10"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M1 9L9 1M9 1H3M9 1V7"
						stroke="currentColor"
						strokeWidth="1.2"
					/>
				</svg>
			</div>
		</motion.a>
	);
}

function RolesList({ roles }: { roles: Role[] }) {
	const groups = groupByDepartment(roles);
	let rowIndex = 0;
	return (
		<div className="space-y-10">
			{groups.map(([dept, deptRoles]) => (
				<section key={dept}>
					<h3 className="text-[11px] font-mono uppercase tracking-widest text-foreground/55 dark:text-foreground/45 mb-1">
						{dept}
					</h3>
					<div>
						{deptRoles.map((role) => (
							<RoleRow key={role.id} role={role} index={rowIndex++} />
						))}
					</div>
				</section>
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="border border-dashed border-foreground/[0.1] p-8 text-center">
			<p className="text-md text-foreground/60 dark:text-foreground/50 leading-relaxed">
				No open positions right now.
			</p>
			<p className="mt-2 text-xs text-foreground/45 leading-relaxed">
				We are still happy to hear from you. Reach out at{" "}
				<a
					href="mailto:careers@better-auth.com"
					className="underline decoration-foreground/30 underline-offset-2 hover:text-foreground/70 transition-colors"
				>
					careers@better-auth.com
				</a>
				.
			</p>
		</div>
	);
}

export function CareersPageClient({ roles }: { roles: Role[] }) {
	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left side */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<CareersHero openRoles={roles.length} />
					</div>

					{/* Right side */}
					<div className="relative w-full lg:w-[70%] overflow-x-hidden no-scrollbar">
						<div className="px-5 lg:p-8 lg:pt-20 space-y-10">
							{/* Mobile header */}
							<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden -mx-5 sm:-mx-6 px-5 sm:px-6 mb-5">
								<HalftoneBackground />
								<div className="relative space-y-2 py-16">
									<div className="flex items-center gap-1.5">
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
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight text-balance">
										Join the team
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
										Help us build the future of authentication.
									</p>
								</div>
							</div>

							<h2 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-5">
								CAREERS
								<span className="flex-1 h-px bg-foreground/15" />
							</h2>

							{/* Section: Why Better Auth */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
								className="space-y-5 max-w-2xl"
							>
								<p className="text-md text-foreground/60 leading-relaxed">
									Better Auth is built with the idea of{" "}
									<span className="text-foreground/80">
										democratizing access to high quality software
									</span>
									. We&apos;re a small, focused team shaping how auth works for
									millions of developers.
								</p>

								<p className="text-md text-foreground/60 leading-relaxed">
									Every line of code we write gets used in production by
									thousands of projects, from solo indie hackers to large-scale
									enterprises. The work here has{" "}
									<span className="text-foreground/80">outsized impact</span>.
								</p>

								<p className="text-md text-foreground/60 leading-relaxed">
									We work in the open, move fast, and care deeply about
									developer experience. If you want to do the best work of your
									career on a problem that matters, we&apos;d love to hear from
									you.
								</p>
							</motion.div>

							{/* Section: Open positions */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.15 }}
								className="pt-10"
							>
								{roles.length === 0 ? (
									<EmptyState />
								) : (
									<RolesList roles={roles} />
								)}
							</motion.div>
						</div>
						<Footer />
					</div>
				</div>
			</div>
		</div>
	);
}
