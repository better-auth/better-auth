import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggler";
import Image from "next/image";
import { NavbarMobileBtn } from "./nav-mobile";
import { NavLink } from "./nav-link";
import { Logo } from "./logo";


const hideNavbar = process.env.NODE_ENV === "production"

export const Navbar = () => {
	return (
		<nav className="md:grid grid-cols-12 border-b sticky top-0 flex items-center justify-end bg-background backdrop-blur-md z-50">
			<Link
				href="/"
				className="md:border-r md:px-5 px-2.5 py-4 text-foreground md:col-span-4 lg:col-span-2 shrink-0 transition-colors min-w-[--fd-sidebar-width]"
			>
				<div className="flex items-center gap-2">
					<Logo />
					<p>BETTER-AUTH.</p>
				</div>
			</Link>
			<div className="md:col-span-9 lg:col-span-10 flex items-center justify-end  ">
				<ul className="md:flex items-center divide-x w-max border-r hidden shrink-0">
					{
						hideNavbar ? null : navMenu.map((menu, i) => (
							<NavLink key={menu.name} href={menu.path}>
								{menu.name}
							</NavLink>
						))
					}
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
	// {
	// 	name: "plugins",
	// 	path: "/plugins",
	// },
	// {
	// 	name: "pre-made ui",
	// 	path: "/ui",
	// },
	// {
	// 	name: "security",
	// 	path: "/security",
	// },
	{
		name: "changelogs",
		path: "/changelogs",
	},
	// {
	// 	name: "resources",
	// 	path: "/resources",
	// },
];
