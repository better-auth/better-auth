import { Github } from "lucide-react";
import Link from "next/link";
import { Icons } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

const footerLinks = [
	{ label: "Terms", href: "/legal/terms" },
	{ label: "Privacy", href: "/legal/privacy" },
	{ label: "Blog", href: "/blog" },
	{ label: "Community", href: "/community" },
	{ label: "Changelog", href: "/changelog" },
];

export default function Footer() {
	return (
		<div className="relative mt-10 py-6 px-5 sm:px-6 lg:px-8">
			<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
				<div className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
					{footerLinks.map((link, i) => (
						<span key={link.label} className="flex items-center">
							<Link
								href={link.href}
								className="group inline-flex items-center gap-1 text-[11px] font-mono text-foreground/50 hover:text-foreground/80 transition-colors"
							>
								{link.label}
							</Link>
							{i < footerLinks.length - 1 && (
								<span className="text-foreground/10 mx-1 text-[10px] select-none">
									/
								</span>
							)}
						</span>
					))}
				</div>

				<div className="flex items-center justify-between w-full sm:w-auto sm:gap-4 shrink-0">
					<span className="text-[10px] text-foreground/50 font-mono">
						© {new Date().getFullYear()} Better Auth Inc.
					</span>
					<div className="flex items-center gap-3 sm:gap-4">
						<span className="text-foreground/10 select-none hidden sm:inline">
							·
						</span>
						<Link
							href="https://x.com/better_auth"
							aria-label="Twitter/X"
							className="text-foreground/50 hover:text-foreground/80 transition-colors"
						>
							<Icons.XIcon className="h-3 w-3" />
						</Link>
						<Link
							href="https://github.com/better-auth"
							aria-label="GitHub"
							className="text-foreground/50 hover:text-foreground/80 transition-colors"
						>
							<Github className="h-4 w-4" />
						</Link>
						<div className="h-4 w-4 flex text-foreground/15 items-center justify-center select-none">
							|
						</div>
						<div className="-ml-4 sm:-ml-5">
							<ThemeToggle />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
