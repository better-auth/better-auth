"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
	children,
	...props
}: {
	children: React.ReactNode;
	[key: string]: any;
}) {
	return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
