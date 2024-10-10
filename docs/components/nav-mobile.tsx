"use client";
import { Menu, Sun, X } from "lucide-react";
import Link from "next/link";
import { Fragment, createContext, useContext, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatePresence, FadeIn } from "@/components/ui/fade-in";
import { contents } from "./sidebar-content";
import { MobileThemeToggle, ThemeToggle } from "./theme-toggler";

interface NavbarMobileContextProps {
	isOpen: boolean;
	toggleNavbar: () => void;
	isDocsOpen: boolean;
	toggleDocsNavbar: () => void;
}

const NavbarContext = createContext<NavbarMobileContextProps | undefined>(
	undefined,
);

export const NavbarProvider = ({ children }: { children: React.ReactNode }) => {
	const [isOpen, setIsOpen] = useState(false);
	const [isDocsOpen, setIsDocsOpen] = useState(false);

	const toggleNavbar = () => {
		setIsOpen((prevIsOpen) => !prevIsOpen);
	};
	const toggleDocsNavbar = () => {
		setIsDocsOpen((prevIsOpen) => !prevIsOpen);
	};
	// @ts-ignore
	return (
		<NavbarContext.Provider
			value={{ isOpen, toggleNavbar, isDocsOpen, toggleDocsNavbar }}
		>
			{children}
		</NavbarContext.Provider>
	);
};

export const useNavbarMobile = (): NavbarMobileContextProps => {
	const context = useContext(NavbarContext);
	if (!context) {
		throw new Error(
			"useNavbarMobile must be used within a NavbarMobileProvider",
		);
	}
	return context;
};

export const NavbarMobileBtn: React.FC = () => {
	const { toggleNavbar } = useNavbarMobile();

	return (
		<div className="flex items-center ">
			<MobileThemeToggle />
			<button
				className="text-muted-foreground overflow-hidden px-2.5 block md:hidden"
				onClick={() => {
					toggleNavbar();
				}}
			>
				<Menu />
			</button>
		</div>
	);
};

export const NavbarMobile = () => {
	const { isOpen, toggleNavbar } = useNavbarMobile();

	return (
		<div className="fixed top-[50px] left-0  px-4 mx-auto w-full h-auto md:hidden transform-gpu [border:1px_solid_rgba(255,255,255,.1)] z-[100] bg-background">
			<AnimatePresence>
				{isOpen && (
					<FadeIn
						fromTopToBottom
						className="bg-transparent p-5 divide-y overflow-y-auto"
					>
						{navMenu.map((menu, i) => (
							<Fragment key={menu.name}>
								{menu.child ? (
									<Accordion type="single" collapsible>
										<AccordionItem value={menu.name}>
											<AccordionTrigger className="text-2xl font-normal text-foreground">
												{menu.name}
											</AccordionTrigger>
											<AccordionContent className="pl-5 divide-y">
												{menu.child.map((child, j) => (
													<Link
														href={child.path}
														key={child.name}
														className="block text-xl py-2 first:pt-0 last:pb-0 border-b last:border-0 text-muted-foreground"
														onClick={toggleNavbar}
													>
														{child.name}
													</Link>
												))}
											</AccordionContent>
										</AccordionItem>
									</Accordion>
								) : (
									<Link
										href={menu.path}
										className="block text-2xl py-4 first:pt-0 last:pb-0"
										onClick={toggleNavbar}
									>
										{menu.name}
									</Link>
								)}
							</Fragment>
						))}
					</FadeIn>
				)}
			</AnimatePresence>
		</div>
	);
};

export const DocsNavbarMobileBtn: React.FC = () => {
	const { toggleDocsNavbar: toggleNavbar } = useNavbarMobile();

	return (
		<button
			className="text-muted-foreground ml-auto block md:hidden"
			onClick={() => {
				toggleNavbar();
			}}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="1.4em"
				height="1.4em"
				viewBox="0 0 24 24"
			>
				<path
					className="fill-foreground"
					fillRule="evenodd"
					d="M2.25 6A.75.75 0 0 1 3 5.25h18a.75.75 0 0 1 0 1.5H3A.75.75 0 0 1 2.25 6m0 4A.75.75 0 0 1 3 9.25h18a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75m0 4a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75m0 4a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75"
					clipRule="evenodd"
					opacity=".5"
				></path>
				<path
					fill="currentColor"
					d="M13.43 14.512a.75.75 0 0 1 1.058-.081l3.012 2.581l3.012-2.581a.75.75 0 1 1 .976 1.139l-3.5 3a.75.75 0 0 1-.976 0l-3.5-3a.75.75 0 0 1-.081-1.058"
				></path>
			</svg>
		</button>
	);
};

export const DocsNavBarMobile = () => {
	const { isDocsOpen: isOpen, toggleDocsNavbar: toggleNavbar } =
		useNavbarMobile();

	return (
		<AnimatePresence>
			{isOpen && (
				<FadeIn
					fromTopToBottom
					className="absolute top-[100px] left-0 bg-background h-[calc(100%-57px-27px)] w-full z-[1000] p-5 divide-y overflow-y-auto"
				>
					{contents.map((menu, i) => (
						<Accordion type="single" collapsible key={menu.title}>
							<AccordionItem value={menu.title}>
								<AccordionTrigger className=" font-normal text-foreground ">
									<div className="flex items-center gap-2">
										{!!menu.Icon && <menu.Icon className="w-5 h-5" />}
										{menu.title}
									</div>
								</AccordionTrigger>
								<AccordionContent className="pl-5 divide-y">
									{menu.list.map((child, j) => (
										<Link
											href={child.href}
											key={child.title}
											className="block text-sm py-2 first:pt-0 last:pb-0 border-b last:border-0 text-muted-foreground"
											onClick={toggleNavbar}
										>
											{child.group ? (
												<div className="flex flex-row gap-2 items-center ">
													<line className="flex-grow h-px bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
													<p className="text-sm bg-gradient-to-tr dark:from-gray-100 dark:to-stone-200 bg-clip-text text-transparent from-gray-900 to-stone-900">
														{child.title}
													</p>
												</div>
											) : (
												<div className="flex items-center gap-2">
													<child.icon />
													{child.title}
												</div>
											)}
										</Link>
									))}
								</AccordionContent>
							</AccordionItem>
						</Accordion>
					))}
				</FadeIn>
			)}
		</AnimatePresence>
	);
};

export const navMenu: {
	name: string;
	path: string;
	child?: {
		name: string;
		path: string;
	}[];
}[] = [
	{
		name: "_helo",
		path: "/",
	},

	{
		name: "_docs",
		path: "/docs",
	},
	{
		name: "_changelogs",
		path: "/changelogs",
	},
	{
		name: "_community",
		path: "https://discord.gg/GYC3W7tZzb",
	},
];
