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
import { signUp } from "~/lib/client/auth";

export function RegisterForm() {
	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const data = new FormData(form);
		console.log(data);
		signUp.email(
			{
				name: data.get("name") as string,
				email: data.get("email") as string,
				password: data.get("password") as string,
			},
			{
				onError: (error) => {
					console.warn(error);
					toast.error(error.error.message);
				},
				onSuccess: () => {
					toast.success("Account has been created!");
				},
			},
		);
	}

	return (
		<Card className="mx-auto max-w-sm">
			<CardHeader>
				<CardTitle className="text-2xl">Sign Up</CardTitle>
				<CardDescription>
					Enter your email below to sign up to an account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form onSubmit={handleSubmit} className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="name">Name</Label>
						<Input
							name="name"
							id="name"
							type="name"
							placeholder="John Doe"
							required
						/>
					</div>
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
						Sign Up
					</Button>
				</form>
				<div className="mt-4 text-center text-sm">
					Already have an account?{" "}
					<Link to="/auth/signin" className="underline">
						Sign in
					</Link>
				</div>
			</CardContent>
		</Card>
	);
}
