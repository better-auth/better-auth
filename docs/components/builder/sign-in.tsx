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
		<Card className="z-50 rounded-none max-w-full">
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
									<Checkbox />
									<Label>Remember me</Label>
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

export const signInString = (options: any) => `"use client"

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { Loader2, Key } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  ${
		options.rememberMe
			? "const [rememberMe, setRememberMe] = useState(false);"
			: ""
	}

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">Sign In</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Enter your email below to login to your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4">
          ${
						options.email
							? `<div className="grid gap-2">
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
                ${
									options.requestPasswordReset
										? `<Link
                    href="#"
                    className="ml-auto inline-block text-sm underline"
                  >
                    Forgot your password?
                  </Link>`
										: ""
								}
              </div>

              <Input
                id="password"
                type="password"
                placeholder="password"
                autoComplete="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            ${
							options.rememberMe
								? `<div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  onClick={() => {
                    setRememberMe(!rememberMe);
                  }}
                />
                <Label htmlFor="remember">Remember me</Label>
              </div>`
								: ""
						}`
							: ""
					}

          ${
						options.magicLink
							? `<div className="grid gap-2">
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
              <Button
                disabled={loading}
                className="gap-2"
                onClick={async () => {
                  await signIn.magicLink(
                  {
                    email
                  },
                  {
                     onRequest: (ctx) => {
                        setLoading(true);
                      },
                     onResponse: (ctx) => {
                         setLoading(false);
                     },
                   },
                  );
                 }}>
                  {loading ? (
                     <Loader2 size={16} className="animate-spin" />
                     ):(
                         Sign-in with Magic Link
                   )}
              </Button>
            </div>`
							: ""
					}

          ${
						options.email
							? `<Button
              type="submit"
              className="w-full"
              disabled={loading}
              onClick={async () => {
                await signIn.email(
                {
                    email,
                    password
                },
                {
                  onRequest: (ctx) => {
                    setLoading(true);
                  },
                  onResponse: (ctx) => {
                    setLoading(false);
                  },
                },
                );
              }}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <p> Login </p>
              )}
              </Button>`
							: ""
					}

          ${
						options.passkey
							? `<Button
              variant="secondary"
              disabled={loading}
              className="gap-2"
              onClick={async () => {
              await signIn.passkey(
                {
                  onRequest: (ctx) => {
                    setLoading(true);
                  },
                  onResponse: (ctx) => {
                    setLoading(false);
                  },
                },
                )
              }}
            >
              <Key size={16} />
              Sign-in with Passkey
            </Button>`
							: ""
					}

          ${
						options.socialProviders?.length > 0
							? `<div className={cn(
              "w-full gap-2 flex items-center",
              ${
								options.socialProviders.length > 3
									? '"justify-between flex-wrap"'
									: '"justify-between flex-col"'
							}
            )}>
              ${options.socialProviders
								.map((provider: string) => {
									const icon =
										socialProviders[provider as keyof typeof socialProviders]
											?.stringIcon || "";
									return `\n\t\t\t\t<Button
                  variant="outline"
                  className={cn(
                    ${
											options.socialProviders.length > 3
												? '"flex-grow"'
												: '"w-full gap-2"'
										}
                  )}
                  disabled={loading}
                  onClick={async () => {
                    await signIn.social(
                    {
                      provider: "${provider}",
                      callbackURL: "/dashboard"
                    },
                    {
                      onRequest: (ctx) => {
                         setLoading(true);
                      },
                      onResponse: (ctx) => {
                         setLoading(false);
                      },
                     },
                    );
                  }}
                >
                  ${icon}
                  ${
										options.socialProviders.length <= 3
											? `Sign in with ${
													provider.charAt(0).toUpperCase() + provider.slice(1)
												}`
											: ""
									}
                </Button>`;
								})
								.join("")}
            </div>`
							: ""
					}
        </div>
      </CardContent>
      ${
				options.label
					? `<CardFooter>
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
        </CardFooter>`
					: ""
			}
    </Card>
  );
}`;
