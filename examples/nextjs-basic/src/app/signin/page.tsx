"use client";
import { auth } from "@/lib/auth/client";
import { caller, signIn } from "@/lib/auth/server";
import { headers } from "next/headers";

export default function Home() {
	return (
		<main className="flex min-h-screen flex-col items-center justify-between p-24">
			<p>Auth</p>
			<button
				onClick={async () => {
					await auth.signUp({
						provider: "github",
						data: {
							name: "name",
							email: "email",
							emailVerified: {
								value: true,
							},
						},
						callbackURL: "/signin",
					});
				}}
				type="submit"
			>
				Continue with github
			</button>
		</main>
	);
}
