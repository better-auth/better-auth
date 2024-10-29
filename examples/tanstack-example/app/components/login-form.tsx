"use client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { signIn } from "~/lib/client/auth";

export function LoginForm() {
	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const data = new FormData(form);
		signIn.email(
			{
				email: data.get("email") as string,
				password: data.get("password") as string,
			},
			{
				onError: (error) => {
					console.warn(error);
					toast.error(error.error.message);
				},
				onSuccess: () => {
					toast.success("You have been logged in!");
				},
			},
		);
	}

	return (
		<Card className="mx-auto max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Sign In</CardTitle>
				<CardDescription>
					Enter your email below to sign in to your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							placeholder="m@example.com"
							required
						/>
					</div>
					<div className="grid gap-2">
						<div className="flex items-center">
							<Label htmlFor="password">Password</Label>
						</div>
						<Input id="password" name="password" type="password" required />
					</div>
					<Button type="submit" className="w-full">
						Sign In
					</Button>
				</form>
				<div className="mt-4 text-center text-sm">
					Don&apos;t have an account?{" "}
					<Link to="/auth/signup" className="underline">
						Sign up
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
