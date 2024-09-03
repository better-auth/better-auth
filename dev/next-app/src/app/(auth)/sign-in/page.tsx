"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input"s;
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { Key } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function Page() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(false);
	const router = useRouter();
	return (
		<div className="h-[50rem] w-full dark:bg-black bg-white  dark:bg-grid-white/[0.2] bg-grid-black/[0.2] relative flex items-center justify-center">
			{/* Radial gradient for the container to give a faded look */}
			<div className="absolute pointer-events-none inset-0 flex items-center justify-center dark:bg-black bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
			<Card className="mx-auto max-w-sm z-50">
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
									href="/forget-password"
									className="ml-auto inline-block text-sm underline"
								>
									Forgot your password?
								</Link>
							</div>
							<PasswordInput
								id="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								autoComplete="password"
								placeholder="Password"
							/>
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								onClick={() => {
									setRememberMe(!rememberMe);
								}}
							/>
							<Label>Remember me</Label>
						</div>
						<Button
							type="submit"
							className="w-full"
							onClick={async () => {
								const res = await authClient.signIn.credential({
									email,
									password,
									callbackURL: "/",
									dontRememberMe: !rememberMe,
								});
								if (res.error) {
									toast.error(res.error.message);
								}
							}}
						>
							Login
						</Button>
						<Button
							variant="outline"
							className="w-full"
							onClick={async () => {
								await authClient.signIn.oauth({
									provider: "github",
									callbackURL: "http://localhost:3000",
								});
							}}
						>
							Login with Github
						</Button>
						<Button
							variant="secondary"
							className="gap-2"
							onClick={async () => {
								const res = await authClient.passkey.signIn({
									callbackURL: "/",
								});
								if (res?.error) {
									toast.error(res.error.message);
								} else {
									router.push("/");
								}
							}}
						>
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
		</div>
	);
}
