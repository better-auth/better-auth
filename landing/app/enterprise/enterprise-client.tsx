"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

const included = [
	"Self-service SSO",
	"Dashboard RBAC",
	"Unlimited seats",
	"Custom audit logs",
	"Implementation assistance",
	"Advanced support",
	"Custom events & security",
	"Log drain",
];

function EnterpriseHero() {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
			className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full"
		>
			<div className="space-y-6">
				<div className="space-y-2">
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
								d="M12 7V3H2v18h20V7zM6 19H4v-2h2zm0-4H4v-2h2zm0-4H4V9h2zm0-4H4V5h2zm4 12H8v-2h2zm0-4H8v-2h2zm0-4H8V9h2zm0-4H8V5h2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8zm-2-8h-2v2h2zm0 4h-2v2h2z"
							/>
						</svg>
						<span className="text-sm text-foreground/60">Enterprise</span>
					</div>
					<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
						Enterprise-grade
						<br />
						<span className="text-neutral-500 dark:text-neutral-400">
							auth at scale.
						</span>
					</h1>
					<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-65">
						Custom plans, unlimited seats, SSO, RBAC, and advanced support for
						teams that need more.
					</p>
				</div>

				<div className="border-t border-foreground/10 pt-4 space-y-0">
					{included.map((item, i) => (
						<motion.div
							key={item}
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								duration: 0.25,
								delay: 0.3 + i * 0.05,
								ease: "easeOut",
							}}
							className="flex items-center gap-2 py-1.5 border-b border-dashed border-foreground/6 last:border-0"
						>
							<span className="text-foreground/40 dark:text-foreground/35 font-mono text-[10px] leading-none select-none shrink-0">
								+
							</span>
							<span className="text-xs text-foreground/70 dark:text-foreground/50 font-mono tracking-wide">
								{item}
							</span>
						</motion.div>
					))}
				</div>

				{/* CTA */}
				<div className="flex items-center gap-3 pt-1">
					<Link
						href="/products/infrastructure"
						className="inline-flex items-center gap-1.5 text-[12px] text-foreground/60 hover:text-foreground/80 font-mono uppercase tracking-wider transition-colors"
					>
						View Products
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

export function EnterprisePageClient() {
	const [loading, startTransition] = useTransition();

	const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) =>
		startTransition(async () => {
			e.preventDefault();

			try {
				const formData = new FormData(e.currentTarget);
				const response = await fetch("/api/enterprise/contact", {
					method: "POST",
					body: JSON.stringify({
						fullName: formData.get("fullName"),
						company: formData.get("company"),
						email: formData.get("email"),
						companySize: formData.get("companySize"),
						description: formData.get("description"),
					}),
					headers: {
						"Content-Type": "application/json",
					},
				});
				const data = await response.json();
				if (!response.ok || response.status !== 200 || !data.success) {
					throw new Error(data.message || "An unknown error occurred");
				}
			} catch (error) {
				console.error("Failed to send contact form", error);
				toast.error(
					(error instanceof Error ? error.message : undefined) ??
						"Failed to send contact form.",
				);
				return;
			}
			toast.success("Thank you for your interest! We'll be in touch soon.");
		});

	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left side — Enterprise hero */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[40%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/6 overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<EnterpriseHero />
					</div>

					{/* Right side — Contact form */}
					<div className="relative w-full lg:w-[60%] overflow-x-hidden no-scrollbar">
						<div className="px-5 lg:p-8 lg:pt-20 space-y-8">
							{/* Mobile header */}
							<div className="lg:hidden relative border-b border-foreground/6 overflow-hidden -mx-5 sm:-mx-6 px-5 sm:px-6 mb-5">
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
												d="M12 7V3H2v18h20V7zM6 19H4v-2h2zm0-4H4v-2h2zm0-4H4V9h2zm0-4H4V5h2zm4 12H8v-2h2zm0-4H8v-2h2zm0-4H8V9h2zm0-4H8V5h2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8zm-2-8h-2v2h2zm0 4h-2v2h2z"
											/>
										</svg>
										<span className="text-sm text-foreground/60">
											Enterprise
										</span>
									</div>
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
										Enterprise-grade
										<br />
										<span className="text-neutral-500 dark:text-neutral-400">
											auth at scale.
										</span>
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
										Custom plans, unlimited seats, SSO, RBAC, and advanced
										support for teams that need more.
									</p>
								</div>
							</div>

							<h2 className="flex items-center gap-3 text-sm sm:text-[15px] font-mono text-neutral-900 dark:text-neutral-100 mb-4 sm:mb-5">
								ENTERPRISE
								<span className="flex-1 h-px bg-foreground/15" />
							</h2>

							{/* Contact form */}
							<motion.div
								initial={{ opacity: 0, y: 6 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.3, delay: 0.05 }}
							>
								<p className="text-[10px] uppercase tracking-widest text-foreground dark:text-foreground font-mono mb-5">
									# Get a demo
								</p>

								<div className="relative border border-foreground/12 overflow-hidden">
									<div className="px-4 py-4 sm:px-5 sm:py-5">
										<div className="space-y-1.5 mb-5">
											<h2 className="text-base font-medium text-foreground/90 dark:text-foreground/85">
												Get in touch
											</h2>
											<p className="text-xs text-foreground/50 dark:text-foreground/45">
												Fill out the form and we&apos;ll be in touch soon.
											</p>
										</div>

										<form onSubmit={handleSubmit} className="space-y-3.5">
											<div>
												<label
													htmlFor="enterprise-name"
													className="block text-[10px] uppercase tracking-widest text-foreground/55 dark:text-foreground/45 font-mono mb-1.5"
												>
													Full name
												</label>
												<input
													id="enterprise-name"
													name="fullName"
													type="text"
													placeholder="Your name"
													className="w-full px-3 py-2 bg-transparent border border-foreground/15 text-foreground/85 dark:text-foreground/75 text-sm placeholder:text-foreground/35 dark:placeholder:text-foreground/25 focus:outline-none focus:border-foreground/40 transition-colors font-mono"
												/>
											</div>

											<div>
												<label
													htmlFor="enterprise-company"
													className="block text-[10px] uppercase tracking-widest text-foreground/55 dark:text-foreground/45 font-mono mb-1.5"
												>
													Company
												</label>
												<input
													id="enterprise-company"
													name="company"
													type="text"
													placeholder="Company name"
													className="w-full px-3 py-2 bg-transparent border border-foreground/15 text-foreground/85 dark:text-foreground/75 text-sm placeholder:text-foreground/35 dark:placeholder:text-foreground/25 focus:outline-none focus:border-foreground/40 transition-colors font-mono"
												/>
											</div>

											<div>
												<label
													htmlFor="enterprise-email"
													className="block text-[10px] uppercase tracking-widest text-foreground/55 dark:text-foreground/45 font-mono mb-1.5"
												>
													Company email
												</label>
												<input
													id="enterprise-email"
													type="email"
													name="email"
													placeholder="name@company.com"
													className="w-full px-3 py-2 bg-transparent border border-foreground/15 text-foreground/85 dark:text-foreground/75 text-sm placeholder:text-foreground/35 dark:placeholder:text-foreground/25 focus:outline-none focus:border-foreground/40 transition-colors font-mono"
												/>
											</div>

											<div>
												<label
													htmlFor="enterprise-size"
													className="block text-[10px] uppercase tracking-widest text-foreground/55 dark:text-foreground/45 font-mono mb-1.5"
												>
													Company size
												</label>
												<select
													id="enterprise-size"
													name="companySize"
													className="w-full px-3 py-2 bg-background border border-foreground/15 text-foreground/85 dark:text-foreground/75 text-sm focus:outline-none focus:border-foreground/40 transition-colors appearance-none cursor-pointer font-mono"
												>
													<option value="">Select</option>
													<option value="1-10">1-10</option>
													<option value="11-50">11-50</option>
													<option value="51-200">51-200</option>
													<option value="201-500">201-500</option>
													<option value="501+">501+</option>
												</select>
											</div>

											<div>
												<label
													htmlFor="enterprise-help"
													className="block text-[10px] uppercase tracking-widest text-foreground/55 dark:text-foreground/45 font-mono mb-1.5"
												>
													What do you need help with?
												</label>
												<textarea
													id="enterprise-help"
													name="description"
													rows={4}
													placeholder="Tell us about your project and requirements..."
													className="w-full px-3 py-2 bg-transparent border border-foreground/15 text-foreground/85 dark:text-foreground/75 text-sm placeholder:text-foreground/35 dark:placeholder:text-foreground/25 focus:outline-none focus:border-foreground/40 transition-colors resize-none font-mono"
												/>
											</div>

											<button
												disabled={loading}
												type="submit"
												className="w-full py-2 bg-foreground text-background text-sm font-mono uppercase tracking-widest hover:opacity-90 transition-colors disabled:opacity-50 disabled:pointer-events-none"
											>
												{loading ? "Sending..." : "Send"}
											</button>
										</form>

										<p className="mt-4 text-foreground/40 dark:text-foreground/30 text-[10px] leading-relaxed">
											By submitting, you agree to our{" "}
											<Link
												href="/legal/terms"
												className="underline hover:text-foreground/55"
											>
												Terms of Service
											</Link>{" "}
											and{" "}
											<Link
												href="/legal/privacy"
												className="underline hover:text-foreground/55"
											>
												Privacy Policy
											</Link>
											.
										</p>
									</div>
								</div>
							</motion.div>
						</div>
						<Footer />
					</div>
				</div>
			</div>
		</div>
	);
}
