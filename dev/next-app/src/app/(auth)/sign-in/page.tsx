"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { Key } from "lucide-react";

export default function Page() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	return (
		<main className="flex min-h-screen flex-col items-center justify-between p-24">
			<Card className="mx-auto max-w-sm">
				<CardHeader>
					<CardTitle className="text-2xl">Login</CardTitle>
					<CardDescription>
						Enter your email below to login to your account
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
								required
								onChange={(e) => {
									setEmail(e.target.value);
								}}
								value={email}
							/>
						</div>
						<div className="grid gap-2">
							<div className="flex items-center">
								<Label htmlFor="password">Password</Label>
								<Link
									href="#"
									className="ml-auto inline-block text-sm underline"
								>
									Forgot your password?
								</Link>
							</div>
							<Input id="password" type="password" required
								onChange={(e) => {
									setPassword(e.target.value);
								}}
								value={password}
							/>
						</div>
						<Button type="submit" className="w-full" onClick={async () => {
							await authClient.signIn.credential({
								body: {
									email,
									password,
									callbackURL: "/"
								}
							})
						}}>
							Login
						</Button>
						<Button
							variant="outline"
							className="w-full"
							onClick={async () => {
								await authClient.signIn.oauth({
									body: {
										provider: "github",
										callbackURL: "http://localhost:3000",
									}
								});
							}}
						>
							Login with Github
						</Button>
						<Button variant="secondary" className="gap-2" onClick={async () => {

						}}>
							<Key size={16} />
							Login with Passkey
						</Button>
					</div>
					<div className="mt-4 text-center text-sm">
						Don&apos;t have an account?{" "}
						<Link href="/sign-up" className="underline">
							Sign up
						</Link>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
