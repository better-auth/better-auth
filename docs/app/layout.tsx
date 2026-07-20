import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { HashSmoothScroll } from "@/components/hash-smooth-scroll";
import { StaggeredNavFiles } from "@/components/landing/staggered-nav-files";
import { Providers } from "@/components/providers";
import { fontVariables } from "@/lib/fonts";
import { createMetadata } from "@/lib/metadata";
import { cn } from "@/lib/utils";

export const metadata: Metadata = createMetadata({
	title: {
		template: "%s | Better Auth",
		default: "Better Auth",
	},
	description: "The Most Comprehensive Authentication Framework",
});

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang="en"
			className={cn(fontVariables, "antialiased")}
			suppressHydrationWarning
			data-scroll-behavior="smooth"
		>
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
				<Script src="/hash-scroll-boot.js" strategy="beforeInteractive" />
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
			<body suppressHydrationWarning>
				<Providers>
					<HashSmoothScroll />
					<div className="relative min-h-dvh">
						<StaggeredNavFiles />
						{children}
					</div>
				</Providers>
				<Analytics />
			</body>
		</html>
	);
}
