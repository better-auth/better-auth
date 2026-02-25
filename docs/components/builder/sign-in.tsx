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
					<div className="w-full gap-2 flex flex-wrap">
						{(() => {
							const selectedProviders = options.socialProviders;
							const count = selectedProviders.length;

							// Layout rules:
							// - 1-3 providers: full width, show "Sign in with [Provider]"
							// - 4+ providers: wrap in rows with provider names (top) and icons (bottom)
							//   - namedCount = count % 4 (or 4 if evenly divisible)
							//   - named providers show just the provider name, 2 per row (1/2 width each)
							//   - icon-only providers show just icon, 4 per row (1/4 width each)

							if (count <= 3) {
								// 1-3 providers: full width with "Sign in with [Provider]"
								return selectedProviders.map((provider) => {
									const { Icon } =
										socialProviders[provider as keyof typeof socialProviders];
									const providerName =
										provider.charAt(0).toUpperCase() + provider.slice(1);

									return (
										<Button
											key={provider}
											variant="outline"
											className="w-full gap-2"
										>
											<Icon className="size-4 shrink-0" />
											Sign in with {providerName}
										</Button>
									);
								});
							}

							// 4+ providers: use wrapping layout
							const remainder = count % 4;
							const namedCount = remainder === 0 ? 4 : remainder;

							return selectedProviders.map((provider, index) => {
								const { Icon } =
									socialProviders[provider as keyof typeof socialProviders];
								const isNamed = index < namedCount;
								const providerName =
									provider.charAt(0).toUpperCase() + provider.slice(1);

								// Determine width class and if full width (for text display)
								let widthClass: string;
								let isFullWidth = false;
								if (isNamed) {
									// Named providers: 2 per row (1/2 width each)
									// If odd number of named providers, first one takes full width
									if (namedCount === 1) {
										widthClass = "w-full";
										isFullWidth = true;
									} else if (namedCount % 2 === 1 && index === 0) {
										// Odd number of named providers, first one takes full width
										widthClass = "w-full";
										isFullWidth = true;
									} else {
										widthClass = "w-[calc(50%-0.25rem)]";
									}
								} else {
									// Icon-only providers: 1/4 width (4 per row)
									widthClass = "w-[calc(25%-0.375rem)]";
								}

								return (
									<Button
										key={provider}
										variant="outline"
										className={cn(widthClass, "gap-2")}
									>
										<Icon className="size-4 shrink-0" />
										{isNamed &&
											(isFullWidth
												? `Sign in with ${providerName}`
												: providerName)}
									</Button>
								);
							});
						})()}
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
