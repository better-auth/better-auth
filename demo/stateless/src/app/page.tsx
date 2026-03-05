"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signIn, useSession } from "@/lib/auth-client";

export default function Home() {
	const router = useRouter();
	const { data: session, isPending } = useSession();

	useEffect(() => {
		if (session) {
			router.push("/dashboard");
		}
	}, [session, router]);

	const handleGitHubSignIn = async () => {
		await signIn.social({
			provider: "github",
			callbackURL: "/dashboard",
		});
	};

	if (isPending) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen flex items-center justify-center px-6 md:px-0">
			<main className="flex flex-col gap-6 items-center justify-center max-w-2xl w-full">
				<div className="flex flex-col gap-2 text-center">
					<h1 className="font-bold text-4xl text-foreground">Better Auth.</h1>
					<p className="text-muted-foreground text-sm md:text-base">
						Minimal demo showcasing{" "}
						<span className="italic underline">
							stateless session management
						</span>{" "}
						with GitHub OAuth.
					</p>
				</div>

				<div className="w-full flex flex-col gap-4">
					<div className="border-y py-3 border-dotted bg-secondary/60">
						<div className="text-xs flex items-center gap-2 justify-center text-muted-foreground">
							<span className="text-center">
								⚡ Sessions stored in encrypted JWT cookies • No database
								required
							</span>
						</div>
					</div>

					<div className="flex flex-col gap-3 p-6 border bg-card rounded-lg">
						<div className="space-y-2">
							<h2 className="text-lg font-semibold text-card-foreground">
								Stateless Session Mode
							</h2>
							<p className="text-sm text-muted-foreground">
								This demo uses{" "}
								<code className="px-1.5 py-0.5 bg-muted rounded text-xs">
									storeSessionInCookie: true
								</code>{" "}
								to store session and user data in encrypted JWT tokens.
							</p>
						</div>

						<button
							onClick={handleGitHubSignIn}
							className="w-full py-3 px-4 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors font-medium"
						>
							Sign in with GitHub
						</button>
					</div>

					<div className="flex flex-col gap-3 p-6 border bg-card rounded-lg">
						<h3 className="text-sm font-semibold text-card-foreground">
							How it works
						</h3>
						<ul className="text-sm text-muted-foreground space-y-2">
							<li className="flex items-start gap-2">
								<span className="text-primary mt-0.5">•</span>
								<span>
									User and session data encrypted using AES-256-CBC-HS512
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-primary mt-0.5">•</span>
								<span>No database queries needed for session validation</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-primary mt-0.5">•</span>
								<span>
									Works across multiple servers without shared storage
								</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-primary mt-0.5">•</span>
								<span>Server-side session access fully supported</span>
							</li>
							<li className="flex items-start gap-2">
								<span className="text-yellow-600 dark:text-yellow-500 mt-0.5">
									ℹ
								</span>
								<span>
									Sessions expire automatically, manual revocation requires
									database
								</span>
							</li>
						</ul>
					</div>
				</div>
			</main>
		</div>
	);
}
