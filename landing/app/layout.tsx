import { GeistPixelSquare } from "geist/font/pixel";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import type { Metadata } from "next";
import Script from "next/script";
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

export const metadata: Metadata = {
	metadataBase: new URL(
		process.env.VERCEL_URL
			? `https://${process.env.VERCEL_URL}`
			: process.env.NODE_ENV === "production"
				? "https://better-auth.com"
				: (process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"),
	),
	title: {
		template: "%s | Better Auth",
		default: "Better Auth",
	},
	description: "The Most Comprehensive Authentication Framework",
	icons: {
		icon: [
			{ url: "/favicon/favicon.ico", sizes: "any" },
			{
				url: "/favicon/favicon-32x32.png",
				sizes: "32x32",
				type: "image/png",
			},
			{
				url: "/favicon/favicon-16x16.png",
				sizes: "16x16",
				type: "image/png",
			},
		],
		apple: "/favicon/apple-touch-icon.png",
	},
	openGraph: {
		images: ["https://docs.better-auth.com/og.png"],
	},
	twitter: {
		card: "summary_large_image",
		images: ["https://docs.better-auth.com/og.png"],
	},
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
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
				{process.env.NODE_ENV === "development" && (
					<Script
						src="//unpkg.com/react-grab/dist/index.global.js"
						crossOrigin="anonymous"
						strategy="beforeInteractive"
						data-options={JSON.stringify({
							activationKey: " ",
							activationMode: "toggle",
							allowActivationInsideInput: false,
							maxContextLines: 3,
						})}
					/>
				)}
				{process.env.NODE_ENV === "development" && (
					<Script
						src="//unpkg.com/@react-grab/mcp/dist/client.global.js"
						strategy="lazyOnload"
					/>
				)}
			</head>
			<body
				className={`${fontSans.variable} ${fontMono.variable} ${GeistPixelSquare.variable} font-sans antialiased overflow-x-hidden`}
				suppressHydrationWarning
			>
				<Providers>
					<CommandMenuProvider>
						<div className="relative h-dvh overflow-x-hidden">
							<StaggeredNavFiles />
							<div className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain">
								{children}
							</div>
						</div>
					</CommandMenuProvider>
				</Providers>
			</body>
		</html>
	);
}
