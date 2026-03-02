"use client";

import { motion } from "framer-motion";
import { HalftoneBackground } from "@/components/landing/halftone-bg";
import { FrameworkContent, FrameworkHero } from "../products/products-client";

export default function FrameworkPage() {
	return (
		<div className="relative h-full overflow-x-hidden">
			<div className="relative text-foreground h-full">
				<div className="flex flex-col lg:flex-row h-full">
					<div className="hidden lg:block relative w-full lg:w-[30%] border-b lg:border-b-0 lg:border-r border-foreground/[0.06] overflow-hidden px-5 sm:px-6 lg:px-10">
						<div className="hidden lg:block">
							<HalftoneBackground />
						</div>
						<motion.div
							initial={{ opacity: 0, x: -10 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.25 }}
							className="h-full"
						>
							<FrameworkHero />
						</motion.div>
					</div>

					<div className="relative w-full lg:w-[70%] overflow-y-auto overflow-x-hidden no-scrollbar">
						<div className="px-5 sm:px-6 lg:px-8 pt-16 lg:pt-16 pb-4">
							<motion.h2
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.2 }}
								className="text-base text-foreground/90 tracking-tight"
							>
								Better Auth Framework
							</motion.h2>
						</div>
						<motion.div
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.25 }}
						>
							<FrameworkContent />
						</motion.div>
					</div>
				</div>
			</div>
		</div>
	);
}
