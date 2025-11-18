import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Blog - Better Auth",
	description: "Latest updates, articles, and insights about Better Auth",
};

interface BlogLayoutProps {
	children: React.ReactNode;
}

export default function BlogLayout({ children }: BlogLayoutProps) {
	return (
		<div className="relative flex min-h-screen flex-col no-scrollbar">
			<main className="flex-1">{children}</main>
		</div>
	);
}
