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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { authClient } from "@/lib/auth-client";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
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
								const res = await authClient.signIn.email({
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
							className="w-full gap-2"
							onClick={async () => {
								await authClient.signIn.social({
									provider: "github",
									callbackURL: "/",
								});
							}}
						>
							<GitHubLogoIcon />
							Signup with Github
						</Button>
						<Button
							variant="outline"
							className="w-full gap-2"
							onClick={async () => {
								await authClient.signIn.social({
									provider: "google",
									callbackURL: "/",
								});
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="0.98em"
								height="1em"
								viewBox="0 0 256 262"
							>
								<path
									fill="#4285F4"
									d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
								/>
								<path
									fill="#34A853"
									d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
								/>
								<path
									fill="#FBBC05"
									d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
								/>
								<path
									fill="#EB4335"
									d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
								/>
							</svg>
							Login with Google
						</Button>
						<Button
							variant="secondary"
							className="gap-2"
							onClick={async () => {
								const res = await authClient.signIn.passkey({
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
