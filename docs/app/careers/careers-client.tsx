"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import type { Job } from "./careers-data";

type RoleFilter = {
	city: string;
	department: string;
};

function formatEmploymentType(type: string): string {
	const map: Record<string, string> = {
		full_time: "Full-time",
		part_time: "Part-time",
		contract: "Contract",
		intern: "Intern",
		temporary: "Temporary",
	};
	return map[type] ?? type.replace(/_/g, "-");
}

function getCity(locationName?: string | null) {
	return (locationName?.split(",")[0] ?? "Remote").trim();
}

function getDepartmentName(departments?: Array<{ name: string }> | null) {
	return departments?.[0]?.name?.trim() || null;
}

function getLocationDepartmentRows(
	jobs: Job[],
): Array<{ city: string; department: string; openRoles: number }> {
	const counts = jobs.reduce<
		Record<string, { city: string; department: string; openRoles: number }>
	>((acc, job) => {
		const city = getCity(job.location?.name);
		const department = getDepartmentName(job.departments) ?? "—";
		const key = `${city}::${department}`;
		acc[key] = acc[key]
			? { ...acc[key], openRoles: acc[key].openRoles + 1 }
			: { city, department, openRoles: 1 };
		return acc;
	}, {});
	return Object.values(counts).sort((a, b) => {
		if (a.city !== b.city) return a.city.localeCompare(b.city);
		return a.department.localeCompare(b.department);
	});
}

function matchesFilter(job: Job, filter: RoleFilter) {
	return (
		getCity(job.location?.name) === filter.city &&
		(getDepartmentName(job.departments) ?? "—") === filter.department
	);
}

function CareersHero({
	rows,
	activeFilter,
	onFilterSelect,
}: {
	rows: Array<{ city: string; department: string; openRoles: number }>;
	activeFilter: RoleFilter | null;
	onFilterSelect: (filter: RoleFilter) => void;
}) {
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

				{/* Location table */}
				<div className="border-t border-foreground/10 pt-4">
					<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] gap-3 border-b border-foreground/[0.06] pb-1.5">
						<span className="text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/50 dark:text-foreground/40">
							Location
						</span>
						<span className="text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/50 dark:text-foreground/40">
							Department
						</span>
						<span className="text-right text-[9px] font-mono uppercase tracking-[0.18em] text-foreground/50 dark:text-foreground/40">
							Open roles
						</span>
					</div>
					{rows.length === 0 ? (
						<div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] gap-3 py-1.5">
							<span className="text-sm text-foreground/50 dark:text-foreground/40">
								—
							</span>
							<span className="text-sm text-foreground/50 dark:text-foreground/40">
								—
							</span>
							<span className="text-right text-sm text-foreground/50 dark:text-foreground/40 font-mono">
								0
							</span>
						</div>
					) : (
						rows.map(({ city, department, openRoles }, i) => (
							<motion.div
								key={`${city}-${department}`}
								initial={{ opacity: 0, x: -8 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{
									duration: 0.25,
									delay: 0.3 + i * 0.06,
									ease: "easeOut",
								}}
								className="border-b border-dashed border-foreground/[0.06] last:border-0"
							>
								<button
									type="button"
									onClick={() => onFilterSelect({ city, department })}
									aria-pressed={
										activeFilter?.city === city &&
										activeFilter?.department === department
									}
									data-testid={`filter-${city}-${department}`}
									className={`grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem] gap-3 py-1.5 text-left transition-colors ${
										activeFilter?.city === city &&
										activeFilter?.department === department
											? "bg-foreground/[0.04]"
											: "hover:bg-foreground/[0.02]"
									}`}
								>
									<span className="text-[13px] text-foreground/70 dark:text-foreground/50 uppercase tracking-wide">
										{city}
									</span>
									<span className="text-[13px] text-foreground/70 dark:text-foreground/50 uppercase tracking-wide">
										{department}
									</span>
									<span className="text-right text-[13px] text-foreground/85 dark:text-foreground/75 font-mono">
										{openRoles}
									</span>
								</button>
							</motion.div>
						))
					)}
				</div>

				{/* Contact link */}
				<div className="flex items-center gap-3 pt-1">
					<a
						href="mailto:careers@better-auth.com"
						className="inline-flex items-center gap-1.5 text-[13px] text-foreground/40 hover:text-foreground/70 font-mono uppercase tracking-wider transition-colors"
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

function RoleCard({ role, index }: { role: Job; index: number }) {
	const city = getCity(role.location?.name);
	const department = getDepartmentName(role.departments);
	const applyUrl = role.absolute_url.startsWith("https://")
		? role.absolute_url
		: null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: 0.3,
				delay: 0.2 + index * 0.08,
				ease: "easeOut",
			}}
			className="group relative overflow-hidden border border-foreground/[0.1] bg-foreground/[0.018] shadow-sm shadow-black/[0.03] transition-all duration-300 hover:z-10 hover:-translate-y-px hover:border-foreground/[0.18] hover:bg-foreground/[0.03] hover:shadow-lg hover:shadow-black/[0.06] dark:border-white/[0.07] dark:bg-white/[0.015] dark:shadow-black/[0.2] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.03] dark:hover:shadow-black/[0.35]"
		>
			<div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/18 to-transparent dark:via-white/[0.14]" />

			{/* Corner marks */}
			<span className="absolute top-2 left-2 text-[9px] font-mono text-foreground/22 dark:text-foreground/16 select-none leading-none">
				+
			</span>
			<span className="absolute top-2 right-2 text-[9px] font-mono text-foreground/22 dark:text-foreground/16 select-none leading-none">
				+
			</span>
			<span className="absolute bottom-2 left-2 text-[9px] font-mono text-foreground/22 dark:text-foreground/16 select-none leading-none">
				+
			</span>
			<span className="absolute bottom-2 right-2 text-[9px] font-mono text-foreground/22 dark:text-foreground/16 select-none leading-none">
				+
			</span>

			<div className="p-5 sm:p-6 space-y-4">
				{/* Header */}
				<div className="space-y-3">
					<h3 className="text-base sm:text-lg text-foreground/92 dark:text-foreground/86 tracking-tight">
						{applyUrl ? (
							<a
								href={applyUrl}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1.5 underline decoration-foreground/30 underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground/70 dark:hover:text-foreground"
							>
								{role.title}
								<svg
									className="mt-px h-3 w-3 shrink-0 opacity-65"
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
							</a>
						) : (
							role.title
						)}
					</h3>
					<div className="flex items-center gap-2">
						<span className="border border-foreground/[0.14] bg-foreground/[0.03] px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-widest text-foreground/58 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-foreground/48 leading-none">
							{formatEmploymentType(role.employment_type)}
						</span>
						<span className="border border-foreground/[0.14] bg-foreground/[0.03] px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-widest text-foreground/58 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-foreground/48 leading-none">
							{city}
						</span>
						{department && (
							<span className="border border-foreground/[0.14] bg-foreground/[0.03] px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-widest text-foreground/58 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-foreground/48 leading-none">
								{department}
							</span>
						)}
					</div>
				</div>

				{role.roleParagraphs.length > 0 && (
					<div className="space-y-3">
						{role.roleParagraphs.map((paragraph, paragraphIndex) => (
							<p
								key={`${role.id}-${paragraphIndex}`}
								className="text-[14px] leading-relaxed text-foreground/66 dark:text-foreground/56"
							>
								{paragraph}
							</p>
						))}
					</div>
				)}

				{/* Apply CTA */}
				<div className="pt-2">
					<a
						href={applyUrl ?? "#"}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 bg-foreground px-3.5 py-2 text-background transition-all hover:opacity-90 cursor-pointer"
					>
						<span className="font-mono text-[10px] uppercase tracking-widest">
							Apply
						</span>
						<svg
							className="h-2.5 w-2.5 opacity-80"
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

export function CareersPageClient({ jobs }: { jobs: Job[] }) {
	const [activeFilter, setActiveFilter] = useState<RoleFilter | null>(null);
	const rows = getLocationDepartmentRows(jobs);
	const filteredJobs = activeFilter
		? jobs.filter((job) => matchesFilter(job, activeFilter))
		: jobs;

	function handleFilterSelect(filter: RoleFilter) {
		setActiveFilter((current) =>
			current?.city === filter.city && current?.department === filter.department
				? null
				: filter,
		);
	}

	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left side */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<CareersHero
							rows={rows}
							activeFilter={activeFilter}
							onFilterSelect={handleFilterSelect}
						/>
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
							>
								<div className="relative border border-dashed border-foreground/[0.08] overflow-hidden">
									<div className="px-5 py-5 sm:px-8 sm:py-8 space-y-5 max-w-2xl">
										<p className="text-[15px] text-foreground/60 leading-relaxed">
											Better Auth is built with the idea of{" "}
											<span className="text-foreground/80">
												democratizing access to high quality software
											</span>
											. We&apos;re a small, focused team shaping how auth works
											for millions of developers.
										</p>

										<p className="text-[15px] text-foreground/60 leading-relaxed">
											Every line of code we write gets used in production by
											thousands of projects &mdash; from solo indie hackers to
											large-scale enterprises. The work here has{" "}
											<span className="text-foreground/80">
												outsized impact
											</span>
											.
										</p>

										<p className="text-[15px] text-foreground/60 leading-relaxed">
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
								{filteredJobs.length === 0 ? (
									<p className="text-sm text-foreground/50 dark:text-foreground/40">
										{activeFilter
											? "No open positions match the current filter. Adjust the table selection or reach out at "
											: "No open positions right now. Check back soon or reach out at "}
										<a
											href="mailto:careers@better-auth.com"
											className="underline underline-offset-2 hover:text-foreground/70 transition-colors"
										>
											careers@better-auth.com
										</a>
										.
									</p>
								) : (
									<div className="space-y-4">
										{activeFilter && (
											<div className="flex items-center justify-between gap-3 border border-dashed border-foreground/[0.08] px-4 py-3">
												<p className="text-[12px] font-mono uppercase tracking-[0.16em] text-foreground/55">
													Showing {activeFilter.city} /{" "}
													{activeFilter.department}
												</p>
												<button
													type="button"
													onClick={() => setActiveFilter(null)}
													data-testid="clear-role-filter"
													className="text-[10px] font-mono uppercase tracking-[0.16em] text-foreground/45 transition-colors hover:text-foreground/70"
												>
													Show all roles
												</button>
											</div>
										)}
										{filteredJobs.map((role, i) => (
											<RoleCard key={role.id} role={role} index={i} />
										))}
									</div>
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
