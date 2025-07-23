"use client";

import { cn } from "@/lib/utils";

function GridPatterns() {
	return (
		<div
			className={cn(
				"pointer-events-none",
				"fixed inset-y-0 left-0 z-0",
				"w-1/2 h-full",
				"overflow-hidden",
			)}
			aria-hidden="true"
		>
			<div className="absolute opacity-40 inset-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.04)_1px,transparent_1px)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:8px_8px]" />
			<div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br opacity-40 from-white/40 via-transparent to-white/10 dark:from-white/10 dark:to-transparent mix-blend-screen" />
		</div>
	);
}

export { GridPatterns };
