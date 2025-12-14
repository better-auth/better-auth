"use client";
import Link, { type LinkProps } from "fumadocs-core/link";
import { useI18n } from "fumadocs-ui/provider";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { cn } from "../../../lib/utils";

export interface NavProviderProps {
	/**
	 * Use transparent background
	 *
	 * @defaultValue none
	 */
	transparentMode?: "always" | "top" | "none";
}

export interface TitleProps {
	title?: ReactNode;

	/**
	 * Redirect url of title
	 * @defaultValue '/'
	 */
	url?: string;
}

interface NavContextType {
	isTransparent: boolean;
}

const NavContext = createContext<NavContextType>({
	isTransparent: false,
});

export function NavProvider({
	transparentMode = "none",
	children,
}: NavProviderProps & { children: ReactNode }) {
	const [transparent, setTransparent] = useState(transparentMode !== "none");

	useEffect(() => {
		if (transparentMode !== "top") return;

		const listener = () => {
			if (document.documentElement.hasAttribute("data-anchor-scrolling")) {
				return;
			}
			setTransparent(window.scrollY < 10);
		};

		listener();
		window.addEventListener("scroll", listener, { passive: true });
		return () => {
			window.removeEventListener("scroll", listener);
		};
	}, [transparentMode]);

	return (
		<NavContext.Provider
			value={useMemo(() => ({ isTransparent: transparent }), [transparent])}
		>
			{children}
		</NavContext.Provider>
	);
}

export function useNav(): NavContextType {
	return useContext(NavContext);
}

export function Title({
	title,
	url,
	...props
}: TitleProps & Omit<LinkProps, "title">) {
	const { locale } = useI18n();

	return (
		<Link
			href={url ?? (locale ? `/${locale}` : "/")}
			{...props}
			className={cn(
				"inline-flex items-center gap-2.5 font-semibold",
				props.className,
			)}
		>
			{title}
		</Link>
	);
}
