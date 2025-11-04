import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
	title: "Better Auth - Stateless Session Management",
	description: "Stateless session management demo with GitHub OAuth",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<body className="font-sans antialiased">{children}</body>
		</html>
	);
}
