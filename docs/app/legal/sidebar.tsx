"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const legalPages = [
	{
		name: "Privacy Policy",
		href: "/legal/privacy",
	},
	{
		name: "Terms of Service",
		href: "/legal/terms",
	},
];

export function LegalSidebar() {
	const pathname = usePathname();

	return (
		<aside className="w-full md:w-[250px] shrink-0 px-5 md:px-7 pt-12 md:py-40 md:sticky md:top-0 md:h-dvh">
			<p className="font-mono text-xs uppercase tracking-wider text-foreground/50 mb-2">
				Legal
			</p>
			<nav className="flex flex-col gap-1 border-l py-2">
				{legalPages.map((page) => {
					const active = pathname === page.href;
					return (
						<Link
							key={page.href}
							href={page.href}
							className={cn(
								"text-sm py-0.5 md:py-1 transition-colors ml-4",
								active
									? "text-foreground font-medium"
									: "text-foreground/60 hover:text-foreground/80",
							)}
						>
							{page.name}
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}
