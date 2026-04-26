import type { ReactNode } from "react";
import Footer from "@/components/landing/footer";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { LegalSidebar } from "./sidebar";

export default function LegalLayout({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-dvh pt-14 lg:pt-0">
			<div className="relative text-foreground">
				<div className="flex flex-col lg:flex-row">
					{/* Left — Legal nav */}
					<div className="hidden lg:block relative w-full shrink-0 lg:w-[30%] lg:h-dvh border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-clip px-5 sm:px-6 lg:px-10 lg:sticky lg:top-0">
						<HalftoneBackground />
						<div className="relative w-full pt-6 md:pt-10 pb-6 lg:pb-0 flex flex-col justify-center lg:h-full">
							<div className="space-y-6">
								<div className="space-y-2">
									<h1 className="text-2xl md:text-3xl xl:text-4xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
										<span className="underline underline-offset-4 decoration-foreground/40">
											Legal
										</span>
									</h1>
									<p className="text-sm text-foreground/70 dark:text-foreground/50 leading-relaxed max-w-[260px]">
										Our privacy policy and terms of service. Reach out with any
										questions.
									</p>
								</div>

								<LegalSidebar />
							</div>
						</div>
					</div>

					{/* Mobile header */}
					<div className="lg:hidden relative border-b border-foreground/[0.06] overflow-hidden px-5 sm:px-6">
						<HalftoneBackground />
						<div className="relative space-y-3 py-12">
							<h1 className="text-2xl md:text-3xl text-neutral-800 dark:text-neutral-200 tracking-tight leading-tight">
								<span className="underline underline-offset-4 decoration-foreground/40">
									Legal
								</span>
							</h1>
							<LegalSidebar />
						</div>
					</div>

					{/* Right — Content */}
					<div className="relative w-full lg:w-[70%] overflow-x-hidden no-scrollbar">
						<main className="px-5 sm:px-6 lg:px-16 py-10 lg:py-24 max-w-3xl">
							<article className="prose dark:prose-invert prose-headings:font-semibold prose-headings:tracking-tight">
								{children}
							</article>
						</main>
						<Footer />
					</div>
				</div>
			</div>
		</div>
	);
}
