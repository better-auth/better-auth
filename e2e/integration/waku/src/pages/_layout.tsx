import type { ReactNode } from "react";
import { Link } from "waku";
import { getSession } from "../auth";

export default async function RootLayout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await getSession();
	return (
		<>
			<nav>
				<Link to="/">Home</Link> <Link to="/dashboard">Dashboard</Link>
			</nav>
			<p>{session ? `Signed in as ${session.user.name}` : "Signed out"}</p>
			<main>{children}</main>
		</>
	);
}

export const getConfig = async () => {
	return { render: "dynamic" } as const;
};
