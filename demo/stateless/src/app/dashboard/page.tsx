"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { APIData } from "@/app/api/user/route";
import { authClient, signOut, useSession } from "@/lib/auth-client";

export default function Dashboard() {
	const router = useRouter();
	const { data: session, isPending } = useSession();
	const [serverData, setServerData] = useState<APIData | null | string>(null);
	const [accountData, setAccountData] = useState<Record<string, any> | null>(
		null,
	);
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
				setServerData("Failed to fetch server data");
			}
		});
	};

	const testAccountData = () => {
		startTransition(async () => {
			const { data, error } = await authClient.accountInfo();
			if (data) {
				setAccountData(data.user);
			}
			if (error) {
				console.error(error);
				alert(error.message);
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
							Stateless session
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
						session from the cookie.
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
					<div className="flex items-center justify-between">
						<h2 className="text-lg font-semibold text-card-foreground">
							Account Information
						</h2>
						<button
							onClick={testAccountData}
							disabled={isPendingServer}
							className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm font-medium disabled:opacity-50"
						>
							{isPendingServer ? "Fetching..." : "Fetch Account Info"}
						</button>
					</div>
					<p className="text-sm text-muted-foreground">
						Click the button to fetch account information from the provider.
					</p>
					{accountData && (
						<div className="bg-muted/40 rounded-lg p-4 overflow-x-auto border-l-2 border-primary">
							<pre className="text-xs text-muted-foreground">
								<code>{JSON.stringify(accountData, null, 2)}</code>
							</pre>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
