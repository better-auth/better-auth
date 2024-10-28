import { createRootRoute, Link, useRouter } from "@tanstack/react-router";
import { Outlet, ScrollRestoration } from "@tanstack/react-router";
import { Body, Head, Html, Meta, Scripts } from "@tanstack/start";
import * as React from "react";
import { useEffect } from "react";
import { signOut, useSession } from "~/lib/client/auth";

export const Route = createRootRoute({
	meta: () => [
		{
			charSet: "utf-8",
		},
		{
			name: "viewport",
			content: "width=device-width, initial-scale=1",
		},
		{
			title: "Better Auth - TanStack Start Example",
		},
	],
	component: RootComponent,
});

function RootComponent() {
	const { data } = useSession();
	const { navigate } = useRouter();

	useEffect(() => {
		if (data?.user) {
			navigate("/");
		} else {
			navigate("/auth/signin");
		}
	}, [data, navigate]);

	return (
		<RootDocument>
			<nav>
				{data ? (
					<>
						<p>Hello {data.user.name}</p>
						<button type="button" onClick={() => signOut()}>
							Sign Out
						</button>
					</>
				) : (
					<>
						<Link to="/auth/signin">Sign In</Link>
						<Link to="/auth/signup">Sign Up</Link>
					</>
				)}
			</nav>
			<Outlet />
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<Html>
			<Head>
				<Meta />
			</Head>
			<Body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</Body>
		</Html>
	);
}
