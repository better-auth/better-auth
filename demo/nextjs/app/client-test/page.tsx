"use client";

import { useState } from "react";
import { signIn, client } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { SessionDisplay } from "./_session";

export default function ClientTest() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [loading, setLoading] = useState(false);

	// Get the session data using the useSession hook
	const { data: session, isPending, error } = client.useSession();

	const handleLogin = async () => {
		setLoading(true);
		await signIn.email(
			{
				email,
				password,
				callbackURL: "/client-test",
			},
			{
				onResponse: () => {
					setLoading(false);
				},
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
				<SessionDisplay />
			</div>
		</div>
	);
}
