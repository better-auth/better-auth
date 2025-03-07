"use client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

type Props = {
	href: string;
	children: React.ReactNode;
	className?: string;
	external?: boolean;
};

export const NavLink = ({ href, children, className, external }: Props) => {
	const segment = useSelectedLayoutSegment();
	const isActive =
		segment === href.slice(1) || (segment === null && href === "/");

	return (
		<li className={cn("relative group", className)}>
			<Link
				href={href}
				className={cn(
					"w-full h-full block py-4 px-5 transition-colors",
					"group-hover:text-foreground",
					isActive ? "text-foreground" : "text-muted-foreground",
				)}
				target={external ? "_blank" : "_parent"}
			>
				{children}
			</Link>
			<div
				className={cn(
					"absolute bottom-0 h-0.5 bg-muted-foreground opacity-0 transition-all duration-500",
					"group-hover:opacity-100 group-hover:w-full",
					isActive ? "opacity-100 w-full" : "w-0",
				)}
			/>
		</li>
	);
};
