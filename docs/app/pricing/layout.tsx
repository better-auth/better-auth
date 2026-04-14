import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";

export default function PricingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left side — Hero */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<HalftoneBackground />
						<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full">
							<div className="space-y-6">
								<div className="space-y-2">
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
										<span className="underline underline-offset-4 decoration-foreground/40">
											Pricing
										</span>
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[260px]">
										Connect to our infrastructure and power your self-hosted
										Better Auth with a dashboard, audit logs, security, and
										more.
									</p>
								</div>

								<div className="border-t border-foreground/10 pt-4 space-y-0">
									{[
										{ label: "Starter", value: "Free" },
										{ label: "Pro", value: "$20/mo" },
										{ label: "Enterprise", value: "Custom" },
									].map((item) => (
										<div
											key={item.label}
											className="flex items-baseline justify-between py-1.5 border-b border-dashed border-foreground/[0.06] last:border-0"
										>
											<span className="text-[11px] text-foreground/70 dark:text-foreground/50 uppercase tracking-wider">
												{item.label}
											</span>
											<span className="text-[11px] text-foreground/85 dark:text-foreground/75 font-mono">
												{item.value}
											</span>
										</div>
									))}
								</div>

								<div className="flex items-center gap-3 pt-1">
									<a
										href="https://dash.better-auth.com/sign-in"
										className="inline-flex items-center gap-1.5 px-5 py-2 bg-foreground text-background text-sm font-medium hover:opacity-90 transition-colors"
									>
										Get Started
									</a>
								</div>
							</div>
						</div>
					</div>

					{/* Right side — Content */}
					<div className="relative w-full lg:w-[70%] overflow-x-hidden no-scrollbar">
						<div className="px-5 lg:px-8 lg:pt-20">
							{/* Mobile header */}
							<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden -mx-5 sm:-mx-6 px-5 sm:px-6 mb-5">
								<HalftoneBackground />
								<div className="relative space-y-2 py-16">
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
										<span className="underline underline-offset-4 decoration-foreground/40">
											Pricing
										</span>
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed">
										Connect to our infrastructure and power your self-hosted
										Better Auth with a dashboard, audit logs, security, and
										more.
									</p>
								</div>
							</div>
						</div>

						{children}
						<Footer />
					</div>
				</div>
			</div>
		</div>
	);
}
