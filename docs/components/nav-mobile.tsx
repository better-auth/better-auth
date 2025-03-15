"use client";
import { ChevronRight, Menu } from "lucide-react";
import Link from "next/link";
import { Fragment, createContext, useContext, useState } from "react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { contents, examples } from "./sidebar-content";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
		<div className="flex items-center">
			<button
				className="overflow-hidden px-2.5 block md:hidden"
				onClick={() => {
					toggleNavbar();
				}}
			>
				<Menu className="size-5" />
			</button>
		</div>
	);
};

export const NavbarMobile = () => {
	const { isOpen, toggleNavbar } = useNavbarMobile();
	const pathname = usePathname();
	const isDocs = pathname.startsWith("/docs");

	return (
		<div
			className={cn(
				"fixed top-[50px] inset-x-0 transform-gpu z-[100] bg-background grid grid-rows-[0fr] duration-300 transition-all md:hidden",
				isOpen &&
					"shadow-lg border-b border-[rgba(255,255,255,.1)] grid-rows-[1fr]",
			)}
		>
			<div
				className={cn(
					"px-9 min-h-0 overflow-y-auto max-h-[80vh] divide-y [mask-image:linear-gradient(to_top,transparent,white_40px)] transition-all duration-300",
					isOpen ? "py-5" : "invisible",
					isDocs && "px-4",
				)}
			>
				{navMenu.map((menu) => (
					<Fragment key={menu.name}>
						{menu.child ? (
							<Accordion type="single" collapsible>
								<AccordionItem value={menu.name}>
									<AccordionTrigger
										className={cn(
											"font-normal text-foreground",
											!isDocs && "text-2xl",
										)}
									>
										{menu.name}
									</AccordionTrigger>
									<AccordionContent className="pl-5 divide-y">
										{menu.child.map((child, j) => (
											<Link
												href={child.path}
												key={child.name}
												className={cn(
													"block py-2 border-b first:pt-0 last:pb-0 last:border-0 text-muted-foreground",
													!isDocs && "text-xl",
												)}
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
								className={cn(
									"group flex items-center gap-2.5 first:pt-0 last:pb-0 text-2xl py-4",
									isDocs && "text-base py-2",
								)}
								onClick={toggleNavbar}
							>
								{isDocs && (
									<ChevronRight className="ml-0.5 size-4 text-muted-foreground md:hidden" />
								)}
								{menu.name}
							</Link>
						)}
					</Fragment>
				))}
				<DocsNavBarContent />
			</div>
		</div>
	);
};

function DocsNavBarContent() {
	const pathname = usePathname();
	const { toggleNavbar } = useNavbarMobile();
	if (!pathname.startsWith("/docs")) return null;

	const content = pathname.startsWith("/docs/examples") ? examples : contents;

	return (
		<>
			{content.map((menu) => (
				<Accordion type="single" collapsible key={menu.title}>
					<AccordionItem value={menu.title}>
						<AccordionTrigger className="font-normal text-foreground">
							<div className="flex items-center gap-2">
								{!!menu.Icon && <menu.Icon className="w-5 h-5" />}
								{menu.title}
							</div>
						</AccordionTrigger>
						<AccordionContent className="pl-5 divide-y">
							{menu.list.map((child) => (
								<Link
									href={child.href}
									key={child.title}
									className="block py-2 text-sm border-b first:pt-0 last:pb-0 last:border-0 text-muted-foreground"
									onClick={toggleNavbar}
								>
									{child.group ? (
										<div className="flex flex-row items-center gap-2 ">
											<div className="flex-grow h-px bg-gradient-to-r from-stone-800/90 to-stone-800/60" />
											<p className="text-sm text-transparent bg-gradient-to-tr dark:from-gray-100 dark:to-stone-200 bg-clip-text from-gray-900 to-stone-900">
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
		</>
	);
}

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
		name: "docs",
		path: "/docs",
	},
	{
		name: "examples",
		path: "/docs/examples/next-js",
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
