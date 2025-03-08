"use client";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggler";
import { NavbarMobile, NavbarMobileBtn } from "./nav-mobile";
import { NavLink } from "./nav-link";
import { useSearchContext } from "fumadocs-ui/provider";
import { loglib } from "@loglib/tracker";
import { Search } from "lucide-react";
import { Logo } from "./logo";

export const Navbar = () => {
	const { setOpenSearch } = useSearchContext();
	return (
		<div className="flex flex-col sticky top-0 bg-background backdrop-blur-md z-30">
			<nav className="md:grid grid-cols-12 md:border-b top-0 flex items-center justify-between ">
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
				<div className="md:col-span-10 flex items-center justify-end relative">
					<div
						className="flex items-center gap-2 py-3.5 md:py-4 h-full px-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-stone-900 dark:to-stone-950/80"
						onClick={() => {
							setOpenSearch(true);
							loglib.track("navbar-search-open");
						}}
					>
						<Search className="w-4 h-4" />
						<p className="text-sm text-transparent bg-gradient-to-tr from-gray-700 to-gray-800 dark:from-gray-500 dark:to-stone-400 bg-clip-text">
							 <span className="lg:hidden">Search...</span> <span className="hidden lg:inline">Search documentation...</span>
						</p>
					</div>
					<ul className="md:flex items-center divide-x w-max hidden shrink-0">
						{navMenu.map((menu, i) => (
							<NavLink key={menu.name} href={menu.path}>
								{menu.name}
							</NavLink>
						))}
						<NavLink
							href="https://github.com/better-auth/better-auth"
							className=" bg-muted/20"
							external
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.4em"
								height="1.4em"
								viewBox="0 0 496 512"
							>
								<path
									fill="currentColor"
									d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6c-3.3.3-5.6-1.3-5.6-3.6c0-2 2.3-3.6 5.2-3.6c3-.3 5.6 1.3 5.6 3.6m-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9c2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3m44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9c.3 2 2.9 3.3 5.9 2.6c2.9-.7 4.9-2.6 4.6-4.6c-.3-1.9-3-3.2-5.9-2.9M244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2c12.8 2.3 17.3-5.6 17.3-12.1c0-6.2-.3-40.4-.3-61.4c0 0-70 15-84.7-29.8c0 0-11.4-29.1-27.8-36.6c0 0-22.9-15.7 1.6-15.4c0 0 24.9 2 38.6 25.8c21.9 38.6 58.6 27.5 72.9 20.9c2.3-16 8.8-27.1 16-33.7c-55.9-6.2-112.3-14.3-112.3-110.5c0-27.5 7.6-41.3 23.6-58.9c-2.6-6.5-11.1-33.3 2.6-67.9c20.9-6.5 69 27 69 27c20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27c13.7 34.7 5.2 61.4 2.6 67.9c16 17.7 25.8 31.5 25.8 58.9c0 96.5-58.9 104.2-114.8 110.5c9.2 7.9 17 22.9 17 46.4c0 33.7-.3 75.4-.3 83.6c0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252C496 113.3 383.5 8 244.8 8M97.2 352.9c-1.3 1-1 3.3.7 5.2c1.6 1.6 3.9 2.3 5.2 1c1.3-1 1-3.3-.7-5.2c-1.6-1.6-3.9-2.3-5.2-1m-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9c1.6 1 3.6.7 4.3-.7c.7-1.3-.3-2.9-2.3-3.9c-2-.6-3.6-.3-4.3.7m32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2c2.3 2.3 5.2 2.6 6.5 1c1.3-1.3.7-4.3-1.3-6.2c-2.2-2.3-5.2-2.6-6.5-1m-11.4-14.7c-1.6 1-1.6 3.6 0 5.9s4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2c-1.4-2.3-4-3.3-5.6-2"
								></path>
							</svg>
						</NavLink>
					</ul>
					<ThemeToggle />
					<NavbarMobileBtn />
				</div>
			</nav>
			<NavbarMobile />
		</div>
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
		path: "/community",
	},
];
