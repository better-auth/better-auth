/* eslint-disable @next/next/no-img-element */
"use client";
import { auth } from "@/lib/auth/client";
import { startAuthentication } from "@simplewebauthn/browser";
import { useEffect } from "react";

export default function Home() {
	const session = auth.useSession();
	useEffect(() => {
		// startAuthentication(
		// 	{
		// 		challenge: "challenge",
		// 	},
		// 	true,
		// );
	}, []);
	return (
		<main className="flex min-h-screen flex-col items-center justify-between p-24">
			<p>Auth</p>
			<div>
				{session ? (
					<>
						<img
							src={session.user.image}
							alt="user"
							className="w-10 h-10 rounded-full"
						/>
						<p className="text-sm">{session.user.name}</p>
						<p className="text-xs">{session.user.email}</p>
						<button
							onClick={async () => {
								await auth.signOut();
							}}
							type="submit"
						>
							Sign out
						</button>
					</>
				) : (
					<p>Not signed in</p>
				)}
			</div>
			<div className="flex flex-col">
				<button
					onClick={async () => {
						await auth.signInOrSignUp({
							provider: "github",
							data: {
								email: "email",
								image: "avatar_url",
								name: "name",
								emailVerified: {
									value: true,
								},
							},
						});
					}}
					type="submit"
				>
					Continue with github
				</button>
				<button
					onClick={async () => {
						await auth.signInOrSignUp({
							provider: "google",
							data: {
								email: "email",
								image: "picture",
								name: "name",
								emailVerified: {
									value: true,
								},
							},
						});
					}}
					type="submit"
				>
					Continue with google
				</button>

				<button
					onClick={async () => {
						await auth.signInOrSignUp({
							provider: "github",
							data: {
								email: "email",
								name: "name",
								emailVerified: {
									value: true,
								},
							},
						});
					}}
					type="submit"
				>
					Continue with google
				</button>
			</div>
			<div>
				<input />
				<button
					onClick={async () => {
						const res = await auth.createOrganization({
							organization: {
								name: "Org1",
							},
							member: {
								name: "User1",
							},
						});
					}}
				>
					CreateOrganization
				</button>
			</div>
		</main>
	);
}
