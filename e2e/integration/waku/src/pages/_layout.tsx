import type { ReactNode } from "react";
import { Link } from "waku";
import { getSession } from "../auth";
import { Hydrated } from "../components/hydrated";

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
			<Hydrated />
		</>
	);
}

export const getConfig = async () => {
	return { render: "dynamic" } as const;
};
