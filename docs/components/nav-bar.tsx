import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggler";
import Image from "next/image";
import { NavbarMobileBtn } from "./nav-mobile";
import { NavLink } from "./nav-link";
import { Logo } from "./logo";
import { PulicBetaBadge } from "./beta/badge";

const hideNavbar = false;
export const Navbar = () => {
  return (
    <nav className="md:grid grid-cols-12 border-b sticky top-0 flex items-center justify-between bg-background backdrop-blur-md z-30">
      <Link
        href="/"
        className="md:border-r md:px-5 px-2.5 py-4 text-foreground md:col-span-2 shrink-0 transition-colors md:w-[--fd-sidebar-width]"
      >
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center gap-2">
            <Logo />
            <p>BETTER-AUTH.</p>
          </div>
          {/* <PulicBetaBadge /> */}
        </div>
      </Link>
      <div className="md:col-span-10 flex items-center justify-end">
        <ul className="md:flex items-center divide-x w-max border-r hidden shrink-0">
          {hideNavbar
            ? null
            : navMenu.map((menu, i) => (
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
