import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Blog - Better Auth",
	description: "Latest updates, articles, and insights about Better Auth",
	openGraph: {
		title: "Blog - Better Auth",
		description: "Latest updates, articles, and insights about Better Auth",
		images: ["/api/og-release?heading=Better%20Auth%20Blog"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Blog - Better Auth",
		description: "Latest updates, articles, and insights about Better Auth",
		images: ["/api/og-release?heading=Better%20Auth%20Blog"],
	},
};

export default function BlogLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<RootProvider>
			<div className="relative flex min-h-screen flex-col">
				<main className="flex-1">{children}</main>
			</div>
		</RootProvider>
	);
}
