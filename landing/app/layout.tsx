import { GeistPixelSquare } from "geist/font/pixel";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import type { ReactNode } from "react";
import { CommandMenuProvider } from "@/components/command-menu";
import { StaggeredNavFiles } from "@/components/landing/staggered-nav-files";
import { Providers } from "@/components/providers";

const fontSans = Geist({
	subsets: ["latin"],
	variable: "--font-sans",
});

const fontMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
});

export const metadata = {
	title: {
		template: "%s | Better Auth",
		default: "Better Auth",
	},
	description: "The Most Comprehensive Authentication Framework",
	openGraph: {
		images: ["/og.png"],
	},
	twitter: {
		card: "summary_large_image",
		images: ["/og.png"],
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<link rel="icon" href="/favicon/favicon.ico" sizes="any" />
				<link
					rel="icon"
					type="image/png"
					sizes="32x32"
					href="/favicon/favicon-32x32.png"
				/>
				<link
					rel="icon"
					type="image/png"
					sizes="16x16"
					href="/favicon/favicon-16x16.png"
				/>
				<link
					rel="apple-touch-icon"
					sizes="180x180"
					href="/favicon/apple-touch-icon.png"
				/>
				<link rel="manifest" href="/favicon/site.webmanifest" />
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
			</head>
			<body
				className={`${fontSans.variable} ${fontMono.variable} ${GeistPixelSquare.variable} font-sans antialiased overflow-x-hidden`}
				suppressHydrationWarning
			>
				<Providers>
					<CommandMenuProvider>
						<div className="relative h-dvh overflow-x-hidden">
							<StaggeredNavFiles />
							<div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
								{children}
							</div>
						</div>
					</CommandMenuProvider>
				</Providers>
			</body>
		</html>
	);
}
