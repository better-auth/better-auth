import { Navbar } from "@/components/nav-bar";
import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";
import { NavbarProvider } from "@/components/nav-mobile";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { baseUrl, createMetadata } from "@/lib/metadata";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

export const metadata = createMetadata({
	title: {
		template: "%s | Better Auth",
		default: "Better Auth",
	},
	description: "The most comprehensive authentication library for TypeScript.",
	metadataBase: baseUrl,
});

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon/favicon.ico" sizes="any" />
				<script
					dangerouslySetInnerHTML={{
						__html: `
                    try {
                      if (localStorage.theme === 'dark' || ((!('theme' in localStorage) || localStorage.theme === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                        document.querySelector('meta[name="theme-color"]').setAttribute('content')
                      }
                    } catch (_) {}
                  `,
					}}
				/>
				<script
					src="https://app.databuddy.cc/databuddy.js"
					data-client-id="B9dz5Pb9HMftx3fHOccNs"
					data-track-errors="true"
					defer
				/>
			</head>
			<body
				className={`${GeistSans.variable} ${GeistMono.variable} bg-background font-sans relative `}
			>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem
					disableTransitionOnChange
				>
					<RootProvider
						theme={{
							enableSystem: true,
							defaultTheme: "dark",
						}}
					>
						<NavbarProvider>
							<Navbar />
							{children}
							<Toaster
								toastOptions={{
									style: {
										borderRadius: "0px",
										fontSize: "11px",
									},
								}}
							/>
						</NavbarProvider>
					</RootProvider>
					<Analytics />
				</ThemeProvider>
			</body>
		</html>
	);
}
