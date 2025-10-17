"use client";

import { signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export default function Dashboard() {
	const router = useRouter();
	const { data: session, isPending } = useSession();
	const [serverData, setServerData] = useState<any>(null);
	const [isPendingServer, startTransition] = useTransition();

	useEffect(() => {
		if (!isPending && !session) {
			router.push("/");
		}
	}, [session, isPending, router]);

	const handleSignOut = async () => {
		await signOut();
		router.push("/");
	};

	const testServerSideAccess = () => {
		startTransition(async () => {
			try {
				const response = await fetch("/api/user");
				const data = await response.json();
				setServerData(data);
			} catch (error) {
				setServerData({ error: "Failed to fetch server data" });
			}
		});
	};

	if (isPending) {
		return (
			<div className="min-h-screen flex items-center justify-center">
				<div className="text-muted-foreground">Loading...</div>
			</div>
		);
	}

	if (!session) {
		return null;
	}

	return (
		<div className="min-h-screen p-6 md:p-12">
			<div className="max-w-4xl mx-auto space-y-6">
				<div className="flex flex-col gap-4 p-6 border bg-card rounded-lg">
					<div className="flex items-start justify-between">
						<div className="space-y-1">
							<h1 className="text-2xl font-bold text-card-foreground">
								Dashboard
							</h1>
							<p className="text-sm text-muted-foreground">
								You are successfully authenticated with stateless sessions.
							</p>
						</div>
						<button
							onClick={handleSignOut}
							className="px-4 py-2 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors text-sm font-medium"
						>
							Sign Out
						</button>
					</div>
				</div>

				<div className="flex flex-col gap-4 p-6 border bg-card rounded-lg">
					<div className="flex items-center gap-2">
						<div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
						<h2 className="text-lg font-semibold text-card-foreground">
							Session Information
						</h2>
					</div>
					<div className="px-3 py-2 bg-secondary/60 border-l-2 border-primary rounded">
						<p className="text-xs text-muted-foreground">
							<span className="font-medium text-foreground">Mode:</span>{" "}
							Stateless (JWT-based session)
						</p>
					</div>
					<div className="bg-muted/40 rounded-lg p-4 overflow-x-auto">
						<pre className="text-xs text-muted-foreground">
							<code>{JSON.stringify(session, null, 2)}</code>
						</pre>
					</div>
				</div>

				<div className="flex flex-col gap-4 p-6 border bg-card rounded-lg">
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold text-card-foreground">
							Server-Side Session Access
						</h2>
						<button
							onClick={testServerSideAccess}
							disabled={isPendingServer}
							className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
						>
							{isPendingServer ? "Testing..." : "Test API Call"}
						</button>
					</div>
					<p className="text-sm text-muted-foreground">
						Click the button to make a server-side API call that retrieves your
						session from the JWT cookie.
					</p>
					{serverData && (
						<div className="bg-muted/40 rounded-lg p-4 overflow-x-auto border-l-2 border-primary">
							<pre className="text-xs text-muted-foreground">
								<code>{JSON.stringify(serverData, null, 2)}</code>
							</pre>
						</div>
					)}
				</div>

				<div className="flex flex-col gap-4 p-6 border bg-card rounded-lg">
					<h2 className="text-lg font-semibold text-card-foreground">
						How it works
					</h2>
					<p className="text-sm text-muted-foreground">
						With{" "}
						<code className="px-1.5 py-0.5 bg-muted rounded text-xs">
							storeSessionInCookie: true
						</code>
						, Better Auth stores your session and user data in encrypted JWT
						cookies.
					</p>
					<div className="grid gap-3 mt-2">
						<div className="flex items-start gap-3 p-3 bg-secondary/40 rounded-lg">
							<div className="mt-0.5 text-green-500">✓</div>
							<div className="flex-1">
								<p className="text-sm font-medium text-card-foreground">
									No database queries
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Session validation happens without any database lookups
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 p-3 bg-secondary/40 rounded-lg">
							<div className="mt-0.5 text-green-500">✓</div>
							<div className="flex-1">
								<p className="text-sm font-medium text-card-foreground">
									Encrypted storage
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Data is encrypted using AES-256-CBC-HS512
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 p-3 bg-secondary/40 rounded-lg">
							<div className="mt-0.5 text-green-500">✓</div>
							<div className="flex-1">
								<p className="text-sm font-medium text-card-foreground">
									Scalable architecture
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Works across multiple servers without shared storage
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 p-3 bg-secondary/40 rounded-lg">
							<div className="mt-0.5 text-green-500">✓</div>
							<div className="flex-1">
								<p className="text-sm font-medium text-card-foreground">
									Server-side access works
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Your API routes can still access session data from JWT cookies
								</p>
							</div>
						</div>
						<div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
							<div className="mt-0.5 text-yellow-600 dark:text-yellow-500">
								ℹ
							</div>
							<div className="flex-1">
								<p className="text-sm font-medium text-card-foreground">
									Session expiry only
								</p>
								<p className="text-xs text-muted-foreground mt-0.5">
									Sessions expire based on JWT expiration time. Manual
									revocation requires database mode.
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
