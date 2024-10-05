import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggler";
import Image from "next/image";
import { NavbarMobileBtn } from "./nav-mobile";
import { NavLink } from "./nav-link";
import { Logo } from "./logo";
import { PulicBetaBadge } from "./beta/badge";
import { useState } from "react";
import { MenuIcon, X } from "lucide-react";

export const Navbar = () => {
	return (
		<nav className="sticky z-40 top-0 flex items-center justify-between bg-background backdrop-blur-md">
			<Link
				href="/"
				className="md:border-r md:px-5 px-2.5 py-4 text-foreground md:col-span-2 shrink-0 transition-colors md:w-[--fd-sidebar-width]"
			>
				<div className="flex flex-col gap-2 w-full">
					<div className="flex items-center gap-2">
						<Logo />
						<p>BETTER-AUTH.</p>
					</div>
				</div>
			</Link>
			<div className="md:col-span-10 flex items-center justify-end sticky top-0 z-30 pb-3 w-full font-geist border-b border-black/10 transition duration-200 ease-in-out md:bg-transparent animate-header-slide-down-fade dark:border-white/10  md:backdrop-blur-md">
				<ul className="md:flex items-center divide-x w-max border-r hidden shrink-0">
					{navMenu.map((menu, i) => (
						<NavLink key={menu.name} href={menu.path}>
							{menu.name}
						</NavLink>
					))}
				</ul>
				<ThemeToggle />
				<NavbarMobileBtn />
			</div>
		</nav>
	);
};

export const navMenu = [
	{
		name: "helo_",
		path: "/",
	},
	{
		name: "docs",
		path: "/docs",
	},

	{
		name: "changelogs",
		path: "/changelogs",
	},
	{
		name: "community",
		path: "https://discord.gg/GYC3W7tZzb",
	},
];
