import Link from "next/link";
import { Icons } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

export function SignatureMark() {
	return (
		<div className="flex items-center justify-between gap-3 text-[11px] font-mono text-foreground/50 select-none">
			<div className="flex items-center gap-3">
				<Link
					href="/community"
					className="hover:text-foreground/80 transition-colors"
				>
					Community
				</Link>
				<span className="text-foreground/15">/</span>
				<Link
					href="/changelog"
					className="hover:text-foreground/80 transition-colors"
				>
					Changelog
				</Link>
				<span className="text-foreground/15">/</span>
				<Link
					href="/legal"
					className="hover:text-foreground/80 transition-colors"
				>
					Legal
				</Link>
			</div>
			<div className="flex items-center gap-3">
				<Link
					href="https://x.com/better_auth"
					aria-label="Twitter/X"
					className="text-foreground/50 hover:text-foreground/80 transition-colors"
				>
					<Icons.XIcon className="h-3.5 w-3.5" />
				</Link>
				<Link
					href="https://github.com/better-auth"
					aria-label="GitHub"
					className="text-foreground/50 hover:text-foreground/80 transition-colors"
				>
					<Icons.gitHub className="h-3.5 w-3.5" />
				</Link>
				<div className="flex items-center">
					<span className="h-5 w-px bg-foreground/15 mr-1" />
					<div className="-mx-2">
						<ThemeToggle />
					</div>
				</div>
			</div>
		</div>
	);
}
