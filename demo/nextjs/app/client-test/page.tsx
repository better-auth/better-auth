"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSessionQuery } from "@/data/user/session-query";
import { useSignOutMutation } from "@/data/user/sign-out-mutation";
import { authClient } from "@/lib/auth-client";

export default function Page() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, startTransition] = useTransition();
	const { data: session, isPending, error } = useSessionQuery();
	const signOutMutation = useSignOutMutation();

	const handleLogin = async () => {
		startTransition(async () => {
			await authClient.signIn.email(
				{
					email,
					password,
					callbackURL: "/client-test",
				},
				{
					onError: (ctx) => {
						toast.error(ctx.error.message);
					},
					onSuccess: () => {
						toast.success("Successfully logged in!");
						setEmail("");
						setPassword("");
					},
				},
			);
		});
	};

	return (
		<div className="container mx-auto py-10 space-y-8">
			<h1 className="text-2xl font-bold text-center">
				Client Authentication Test
			</h1>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
				{/* Login Form */}
				<Card>
					<CardHeader>
						<CardTitle>Sign In</CardTitle>
						<CardDescription>
							Enter your email and password to sign in
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									placeholder="m@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="password">Password</Label>
								<Input
									id="password"
									type="password"
									placeholder="••••••••"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
								/>
							</div>
						</div>
					</CardContent>
					<CardFooter>
						<Button className="w-full" onClick={handleLogin} disabled={loading}>
							{loading ? (
								<>
									<Loader2 size={16} className="mr-2 animate-spin" />
									Signing in...
								</>
							) : (
								"Sign In"
							)}
						</Button>
					</CardFooter>
				</Card>

				{/* Session Display */}
				<Card>
					<CardHeader>
						<CardTitle>Session Information</CardTitle>
						<CardDescription>
							{isPending
								? "Loading session..."
								: session
									? "You are currently logged in"
									: "You are not logged in"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						{isPending ? (
							<div className="flex justify-center py-4">
								<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
							</div>
						) : error ? (
							<div className="p-4 bg-destructive/10 text-destructive rounded-md">
								Error: {error.message}
							</div>
						) : session ? (
							<div className="space-y-4">
								<div className="flex items-center gap-4">
									{session.user.image ? (
										<img
											src={session.user.image}
											alt="Profile"
											className="h-12 w-12 rounded-full object-cover"
										/>
									) : (
										<div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
											<span className="text-lg font-medium">
												{session.user.name?.charAt(0) ||
													session.user.email?.charAt(0)}
											</span>
										</div>
									)}
									<div>
										<p className="font-medium">{session.user.name}</p>
										<p className="text-sm text-muted-foreground">
											{session.user.email}
										</p>
									</div>
								</div>

								<div className="rounded-md bg-muted p-4">
									<p className="text-sm font-medium mb-2">Session Details:</p>
									<pre className="text-xs overflow-auto max-h-40">
										{JSON.stringify(session, null, 2)}
									</pre>
								</div>
							</div>
						) : (
							<div className="py-8 text-center text-muted-foreground">
								<p>Sign in to view your session information</p>
							</div>
						)}
					</CardContent>
					{session && (
						<CardFooter>
							<Button
								variant="outline"
								className="w-full"
								onClick={() => signOutMutation.mutate()}
								disabled={signOutMutation.isPending}
							>
								{signOutMutation.isPending ? (
									<Loader2 className="animate-spin" size={16} />
								) : (
									"Sign Out"
								)}
							</Button>
						</CardFooter>
					)}
				</Card>
			</div>
		</div>
	);
}
