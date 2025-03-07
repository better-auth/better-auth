"use client";
import type { ClassValue } from "clsx";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/utils";

type Props = {
	href: string;
	children: React.ReactNode;
	startWith: string;
	title?: string | null;
	className?: ClassValue;
	activeClassName?: ClassValue;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>;

export const AsideLink = ({
	href,
	children,
	startWith,
	title,
	className,
	activeClassName,
	...props
}: Props) => {
	const segment = useSelectedLayoutSegment();
	const path = href;
	const isActive = path.replace("/docs/", "") === segment;

	return (
		<Link
			href={href}
			className={cn(
				isActive
					? cn("text-foreground bg-primary/10", activeClassName)
					: "text-muted-foreground hover:text-foreground hover:bg-primary/10",
				"w-full transition-colors flex items-center gap-x-2.5 hover:bg-primary/10 px-5 py-1",
				className,
			)}
			{...props}
		>
			{children}
		</Link>
	);
};
