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
		<footer className="relative z-40 w-full border-t border-foreground/[0.06] bg-background overflow-hidden">
			{/* Large watermark logo */}
			<div
				className="absolute -right-16 -bottom-12 pointer-events-none select-none opacity-[0.03]"
				aria-hidden="true"
			>
				<svg
					width="360"
					height="270"
					viewBox="0 0 60 45"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						fillRule="evenodd"
						clipRule="evenodd"
						d="M0 0H15V15H30V30H15V45H0V30V15V0ZM45 30V15H30V0H45H60V15V30V45H45H30V30H45Z"
						className="fill-foreground"
					/>
				</svg>
			</div>

			{/* Decorative grid dots */}
			<div
				className="absolute inset-0 pointer-events-none select-none"
				aria-hidden="true"
				style={{
					backgroundImage:
						"radial-gradient(circle, currentColor 0.5px, transparent 0.5px)",
					backgroundSize: "24px 24px",
					opacity: 0.03,
				}}
			/>

			<div className="relative px-5 sm:px-6 lg:px-10 py-6 lg:py-8 space-y-5">
				<div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5">
					{footerLinks.map((link, i) => (
						<span key={link.label} className="flex items-center">
							<Link
								href={link.href}
								className="group inline-flex items-center gap-1 text-[11px] font-mono text-foreground/35 hover:text-foreground/70 transition-colors"
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

				<div className="flex items-center justify-between">
					<span className="text-[10px] text-foreground/20 font-mono">
						© {new Date().getFullYear()} Better Auth Inc.
					</span>
					<div className="flex items-center gap-3 sm:gap-4">
						<Link
							href="https://x.com/better_auth"
							aria-label="Twitter/X"
							className="text-foreground/30 hover:text-foreground/60 transition-colors"
						>
							<Icons.XIcon className="h-3 w-3" />
						</Link>
						<Link
							href="https://github.com/better-auth"
							aria-label="GitHub"
							className="text-foreground/30 hover:text-foreground/60 transition-colors"
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
		</footer>
	);
}
