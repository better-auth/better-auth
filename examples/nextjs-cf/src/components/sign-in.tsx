"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/auth-client";
import { DiscordLogoIcon, GitHubLogoIcon } from "@radix-ui/react-icons";
import { Key, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function SignIn() {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [rememberMe, setRememberMe] = useState(false);
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	return (
		<Card className="z-50 rounded-md rounded-t-none max-w-md">
			<CardHeader>
				<CardTitle className="text-lg md:text-xl">Sign In</CardTitle>
				<CardDescription className="text-xs md:text-sm">
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

					<Button
						type="submit"
						className="w-full"
						disabled={loading}
						onClick={async () => {
							await signIn.magicLink(
								{
									email,
								},
								{
									onRequest(context) {
										setLoading(true);
									},
									onError(ctx) {
										toast.error(ctx.error.message);
										setLoading(false);
									},
									onSuccess(ctx) {
										toast.success("Magic link sent!");
										setLoading(false);
									},
								},
							);
						}}
					>
						{loading ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							"Sign in with Magic Link"
						)}
					</Button>

					<Button
						variant="secondary"
						className="w-full gap-2"
						onClick={async () => {
							await signIn.social({
								provider: "github",
								callbackURL: "/dashboard",
							});
						}}
					>
						<GitHubLogoIcon />
						Continue with GitHub
					</Button>
					<Button
						variant="secondary"
						className="w-full gap-2"
						onClick={async () => {
							await signIn.social({
								provider: "discord",
							});
						}}
					>
						<DiscordLogoIcon />
						Continue with Discord
					</Button>
					<Button
						variant="outline"
						className="gap-2"
						onClick={async () => {
							await signIn.passkey({
								fetchOptions: {
									onResponse(context) {
										router.push("/dashboard");
									},
								},
							});
						}}
					>
						<Key size={16} />
						Sign-in with Passkey
					</Button>
				</div>
			</CardContent>
			<CardFooter>
				<div className="flex justify-center w-full border-t py-4">
					<p className="text-center text-xs text-neutral-500">
						Secured by <span className="text-orange-400">better-auth.</span>
					</p>
				</div>
			</CardFooter>
		</Card>
	);
}
