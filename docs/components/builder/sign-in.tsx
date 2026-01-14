"use client";

import { useAtom } from "jotai";
import { Key } from "lucide-react";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { socialProviders } from "./social-provider";
import { optionsAtom } from "./store";

export default function SignIn() {
	const [options] = useAtom(optionsAtom);
	return (
		<Card className="z-50 rounded-md rounded-t-none">
			<CardHeader>
				<CardTitle className="text-lg md:text-xl">Sign In</CardTitle>
				<CardDescription className="text-xs md:text-sm">
					Enter your email below to login to your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					{options.email && (
						<>
							<div className="grid gap-2">
								<Label htmlFor="email">Email</Label>
								<Input
									id="email"
									type="email"
									placeholder="m@example.com"
									required
								/>
							</div>

							<div className="grid gap-2">
								<div className="flex items-center">
									<Label htmlFor="password">Password</Label>
									{options.requestPasswordReset && (
										<Link
											href="#"
											className="ml-auto inline-block text-sm underline"
										>
											Forgot your password?
										</Link>
									)}
								</div>

								<Input
									id="password"
									type="password"
									placeholder="password"
									autoComplete="password"
								/>
							</div>

							{options.rememberMe && (
								<div className="flex items-center gap-2">
									<Checkbox id="remember-me" />
									<Label htmlFor="remember-me">Remember me</Label>
								</div>
							)}
						</>
					)}

					{options.magicLink && (
						<div className="grid gap-2">
							<Label htmlFor="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="m@example.com"
								required
							/>
							<Button className="gap-2" onClick={async () => {}}>
								Sign-in with Magic Link
							</Button>
						</div>
					)}

					{options.email && (
						<Button type="submit" className="w-full" onClick={async () => {}}>
							Login
						</Button>
					)}

					{options.passkey && (
						<Button variant="secondary" className="gap-2">
							<Key size={16} />
							Sign-in with Passkey
						</Button>
					)}
					<div
						className={cn(
							"w-full gap-2 flex items-center justify-between",
							options.socialProviders.length > 3
								? "flex-row flex-wrap"
								: "flex-col",
						)}
					>
						{Object.keys(socialProviders).map((provider) => {
							if (options.socialProviders.includes(provider)) {
								const { Icon } =
									socialProviders[provider as keyof typeof socialProviders];
								return (
									<Button
										key={provider}
										variant="outline"
										className={cn(
											options.socialProviders.length > 3
												? "flex-grow"
												: "w-full gap-2",
										)}
									>
										<Icon width="1.2em" height="1.2em" />
										{options.socialProviders.length <= 3 &&
											"Sign in with " +
												provider.charAt(0).toUpperCase() +
												provider.slice(1)}
									</Button>
								);
							}
							return null;
						})}
					</div>
				</div>
			</CardContent>
			{options.label && (
				<CardFooter>
					<div className="flex justify-center w-full border-t py-4">
						<p className="text-center text-xs text-neutral-500">
							built with{" "}
							<Link
								href="https://better-auth.com"
								className="underline"
								target="_blank"
							>
								<span className="dark:text-white/70 cursor-pointer">
									better-auth.
								</span>
							</Link>
						</p>
					</div>
				</CardFooter>
			)}
		</Card>
	);
}
