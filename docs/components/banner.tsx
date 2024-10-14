"use client";

import { Banner } from "fumadocs-ui/components/banner";
import Link from "next/link";

export function BetaNotice() {
	return (
		<Banner
			id="beta-notice-1"
			className="lg:text-sm tracking-tight text-xs hidden md:flex bg-gradient-to-tr from-white to-stone-100 border dark:from-stone-900 dark:to-stone-950"
		>
			🚧 Heads up! We're still in beta. It isn't quite production-ready just
			yet. If you run into any bugs or quirks, please report them on{" "}
			<Link
				target="_blank"
				className="mx-1 underline pb-px hover:opacity-80 transition-all"
				href="https://github.com/better-auth/better-auth/issues"
			>
				{" "}
				Github.
			</Link>{" "}
		</Banner>
	);
}
