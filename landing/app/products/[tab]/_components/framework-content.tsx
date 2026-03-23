"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function FrameworkContent() {
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
		<div className="px-5 sm:px-6 lg:px-8 pb-16 space-y-8">
			<motion.div
				initial={{ opacity: 0, y: 6 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3, delay: 0.05 }}
			>
				<p className="text-[15px] text-foreground/70 dark:text-foreground/50 max-w-lg mb-8">
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
