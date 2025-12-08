"use client";

export function EnterpriseHero() {
	return (
		<div className="max-w-xl">
			<div className="space-y-2 xl:space-y-3 text-center xl:text-left">
				<h1 className="text-3xl sm:text-4xl md:text-5xl tracking-tight text-zinc-900 dark:text-white">
					<span className="block sm:inline">BETTER AUTH</span>{" "}
					<span className="relative inline-block">
						<span className="relative z-10 font-extralight">ENTERPRISE</span>
						<span className="absolute bottom-0.5 sm:bottom-1 left-0 w-full h-1.5 sm:h-2 bg-zinc-200 dark:bg-zinc-800"></span>
					</span>
				</h1>
				<p className="text-sm sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400 leading-snug tracking-tight">
					Get direct support from the Better Auth team and deploy Better Auth
					securely inside your organization.
				</p>
			</div>
		</div>
	);
}
