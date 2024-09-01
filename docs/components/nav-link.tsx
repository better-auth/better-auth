"use client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

type Props = {
    href: string;
    children: React.ReactNode;
};

export const NavLink = ({ href, children }: Props) => {
    const segment = useSelectedLayoutSegment();
    const isActive =
        segment === href.slice(1) || (segment === null && href === "/");

    return (
        <li className="relative group">
            <Link
                href={href}
                className={cn(
                    "w-full h-full block py-4 px-5 transition-colors",
                    "group-hover:text-foreground",
                    isActive ? "text-foreground" : "text-muted-foreground",
                )}
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
