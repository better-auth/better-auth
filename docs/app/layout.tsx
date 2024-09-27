import { Navbar } from "@/components/nav-bar";
import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";
import { NavbarProvider } from "@/components/nav-mobile";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { Banner } from "fumadocs-ui/components/banner";
import Link from "next/link";
export const metadata = createMetadata({
	title: {
		template: "%s | Better Auth",
		default: "Better Auth",
	},
	description: "The authentication library for typescript",
	metadataBase: baseUrl,
});

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon/favicon.ico" sizes="any" />
			</head>
			<body
				className={`${GeistSans.variable} ${GeistMono.variable} font-sans overflow-x-hidden`}
			>
				<Banner
					id="public-beta"
					className="lg:text-sm tracking-tight text-xs hidden md:flex bg-gradient-to-tr from-white to-stone-100 border dark:from-stone-900 dark:to-stone-950"
				>
					🚧 Heads up! We're still in beta. It isn't quite production-ready just
					yet. If you run into any bugs or quirks, please report them on{" "}
					<Link
						target="_blank"
						className="mx-1 underline pb-px hover:opacity-80 transition-all"
						href="https://github.com/better-auth/better-auth/issues"
					>
						{" "}
						Github.
					</Link>{" "}
				</Banner>
			<body className={`${GeistSans.variable} ${GeistMono.variable} font-sans overflow-x-hidden`}>
				<RootProvider>
					<NavbarProvider>
						<Navbar />
						{children}
					</NavbarProvider>
				</RootProvider>
			</body>
		</html>
	);
}
