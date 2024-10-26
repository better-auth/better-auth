"use client";

import { Banner } from "fumadocs-ui/components/banner";

export function BetaNotice() {
	return (
		<Banner
			id="beta-notice-1"
			className="lg:text-sm tracking-tight text-xs hidden md:flex bg-gradient-to-tr from-white to-stone-100 border dark:from-zinc-900 dark:to-zinc-950"
		>
			🚧 Heads up! We're still in beta. V1 will be out by nov. 22!
		</Banner>
	);
}
