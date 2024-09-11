import { Navbar } from "@/components/nav-bar";
import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { NavbarProvider } from "@/components/nav-mobile";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ENV } from "@/lib/constants";
import { Metadata } from "next";
import { baseUrl, createMetadata } from "@/lib/metadata";

export const metadata = createMetadata({
	title: {
		template: "%s | Better Auth",
		default: "Better Auth",
	},
	description: "The authentication library for typescript",
	metadataBase: baseUrl,
});

const hideNavbar = true
export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon/favicon.ico" sizes="any" />
			</head>
			<body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
				<RootProvider>
					<div className="min-h-screen w-full dark:bg-black bg-white  dark:bg-grid-small-white/[0.2] bg-grid-small-black/[0.2] relative flex justify-center ">

						{/* Radial gradient for the container to give a faded look */}
						<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
						<div className=" bg-white dark:bg-black border-b py-2 flex justify-between items-center px-4 border-border absolute z-50 w-1/2">
						</div>
						<NavbarProvider>
							{
								hideNavbar ? null : <Navbar />
							}
							{children}
						</NavbarProvider>
					</div>
				</RootProvider>
			</body>
		</html>
	);
}
