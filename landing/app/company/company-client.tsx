// spell-checker:disable
"use client";

import { motion } from "framer-motion";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

function CompanyHero() {
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
						About us
					</h1>
					<p className="text-[11px] text-foreground/40 leading-relaxed max-w-[260px]">
						The team behind the most comprehensive authentication framework for
						the web.
					</p>
				</div>

				{/* Quick stats */}
				<div className="border-t border-foreground/10 pt-4 space-y-0">
					{[
						{ label: "Founded", value: "2024" },
						{ label: "License", value: "MIT" },
						{ label: "Plugins", value: "50+" },
						{ label: "Contributors", value: "100+" },
						{ label: "GitHub stars", value: "20k+" },
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

				{/* Links */}
				<div className="flex items-center gap-3 pt-1">
					<a
						href="https://github.com/better-auth/better-auth"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1.5 text-[12px] text-foreground/40 hover:text-foreground/70 font-mono uppercase tracking-wider transition-colors"
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
					</a>
				</div>
			</div>
		</motion.div>
	);
}

export function CompanyPageClient() {
	return (
		<div className="relative h-full overflow-x-hidden pt-14 lg:pt-0">
			<div className="relative text-foreground h-full">
				<div className="flex flex-col lg:flex-row h-full">
					{/* Left side */}
					<div className="hidden lg:block relative w-full lg:w-[30%] border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<CompanyHero />
					</div>

					{/* Right side */}
					<div className="relative w-full lg:w-[70%] overflow-y-auto overflow-x-hidden no-scrollbar">
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
										d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3s1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5S5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5m8 0c-.29 0-.62.02-.97.05c1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5"
									/>
								</svg>
								<span className="text-sm text-foreground/60">About Us</span>
							</div>

							{/* Section: Our Story */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
							>
								<p className="text-[10px] uppercase tracking-widest text-foreground/30 font-mono mb-5">
									# Our story
								</p>

								<div className="relative border border-dashed border-foreground/[0.08] overflow-hidden">
									<div className="px-5 py-5 sm:px-8 sm:py-8 space-y-5 max-w-2xl">
										<p className="text-[13px] text-foreground/60 leading-relaxed">
											Better Auth started as an open source project made by{" "}
											<a
												href="https://github.com/bekacru"
												target="_blank"
												rel="noreferrer"
												className="text-foreground/80 underline underline-offset-2 decoration-foreground/20 hover:decoration-foreground/40 transition-colors"
											>
												Bereket Engida
											</a>
											. He started the project with a simple insight:{" "}
											<span className="text-foreground/80">
												auth should be owned, and authentication data should be
												owned by the user.
											</span>
										</p>

										<p className="text-[13px] text-foreground/60 leading-relaxed">
											User data should stay in your primary database. There
											shouldn&apos;t be a reason to have two sources of truth.
										</p>

										<p className="text-[13px] text-foreground/60 leading-relaxed">
											Auth should start simple, but as requirements progress it
											should be easy to extend. That&apos;s why Better Auth has
											a plugin ecosystem &mdash; so you can add exactly what you
											need, when you need it.
										</p>

										<p className="text-[13px] text-foreground/60 leading-relaxed">
											In the era of AI agents writing a lot of code, having a
											standard for how the most critical infrastructure pieces
											are implemented is necessary. AI models favor frameworks
											far more than services &mdash; all the context they need
											exists within the code and can be extended or customized
											without leaving the codebase.
										</p>

										<p className="text-[13px] text-foreground/60 leading-relaxed">
											We went on to join Y Combinator in the 2025 spring batch.
											We now have a team and contributors all over the world
											advancing our mission of democratizing authentication and
											empowering developers and companies to be able to own
											their auth and their data.
										</p>
									</div>
								</div>
							</motion.div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
