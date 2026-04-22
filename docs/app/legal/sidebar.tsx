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
		<nav className="border-t border-foreground/10 pt-4 space-y-0">
			{legalPages.map((page) => {
				const active = pathname === page.href;
				return (
					<Link
						key={page.href}
						href={page.href}
						className={cn(
							"flex items-baseline justify-between py-1.5 border-b border-dashed border-foreground/[0.06] last:border-0 transition-colors",
							active
								? "text-foreground"
								: "text-foreground/70 dark:text-foreground/55 hover:text-foreground",
						)}
					>
						<span className="text-[11px] uppercase tracking-wider">
							{page.name}
						</span>
						<span
							className={cn(
								"text-[11px] font-mono transition-opacity",
								active ? "opacity-100" : "opacity-0",
							)}
						>
							→
						</span>
					</Link>
				);
			})}
		</nav>
	);
}
