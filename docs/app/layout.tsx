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
const inter = Inter({
	subsets: ["latin"],
});


export const metadata: Metadata = {
	metadataBase: new URL(ENV.NEXT_PUBLIC_WEBSITE_URL),
	title: {
		default: "Better-Auth.",
		template: "%s ~ Better Auth",
	},
	description: "Dev agnostic auth library solution",
	openGraph: {
		title: "Better-auth",
		description: "Dev agnostic auth library solution",
		url: ENV.NEXT_PUBLIC_WEBSITE_URL,
		siteName: "Better-auth",
		locale: "en_US",
		type: "website",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: {
			index: true,
			follow: true,
			"max-video-preview": -1,
			"max-image-preview": "large",
			"max-snippet": -1,
		},
	},
	twitter: {
		title: "Better-auth",
		card: "summary_large_image",
	},
	verification: {
		google: ENV.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
	},
};


export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className={`${GeistSans.variable} ${GeistMono.variable} font-sans`}>
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
