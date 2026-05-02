"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export default function DashboardPage() {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();

	if (isPending) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-background">
				<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (!session) {
		router.push("/login");
		return null;
	}

	return (
		<div className="min-h-screen bg-background">
			<header className="bg-card border-b">
				<div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
					<h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
					<Button
						variant="destructive"
						onClick={async () => {
							await authClient.signOut();
							toast.success("Signed out successfully");
							router.push("/login");
						}}
					>
						Sign Out
					</Button>
				</div>
			</header>

			<main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
				<Card>
					<CardHeader>
						<CardTitle>Welcome, {session.user.name}!</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<Card className="bg-muted/50">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
									User Info
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2">
								<p className="text-foreground">
									<span className="font-medium">Name:</span> {session.user.name}
								</p>
								<p className="text-foreground">
									<span className="font-medium">Email:</span>{" "}
									{session.user.email}
								</p>
								<p className="text-foreground">
									<span className="font-medium">User ID:</span>{" "}
									{session.user.id}
								</p>
							</CardContent>
						</Card>

						<Card className="bg-muted/50">
							<CardHeader className="pb-2">
								<CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
									Session Info
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-2">
								<p className="text-foreground">
									<span className="font-medium">Session ID:</span>{" "}
									{session.session.id}
								</p>
								<p className="text-foreground">
									<span className="font-medium">Expires:</span>{" "}
									{new Date(session.session.expiresAt).toLocaleString()}
								</p>
							</CardContent>
						</Card>

						<Card className="bg-green-500/10 border-green-500/20">
							<CardContent className="py-4 flex items-center justify-center">
								<p className="text-green-700 dark:text-green-300 text-center">
									✓ Successfully authenticated using the embedded{" "}
									<code className="bg-green-500/20 px-1 rounded">
										{"<Auth />"}
									</code>{" "}
									component!
								</p>
							</CardContent>
						</Card>
					</CardContent>
				</Card>
			</main>
		</div>
	);
}
