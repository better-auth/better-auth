import { socialProviders } from "../../social-provider";
import type { SignInBoxOptions } from "../../store";

export function resolveNextJSFiles(options: SignInBoxOptions) {
	const files = [
		{
			id: "1",
			name: "auth.ts",
			content: `import { betterAuth } from "better-auth";${
				options.magicLink
					? `
import { magicLink } from "better-auth/plugins/magic-link";`
					: ""
			}${
				options.passkey
					? `
import { passkey } from "@better-auth/passkey";`
					: ""
			}

export const auth = betterAuth({
  ${
		options.email
			? `emailAndPassword: {
  enabled: true,
${
	options.requestPasswordReset
		? `async sendResetPassword(data, request) {
      // Send an email to the user with a link to reset their password
    },`
		: ``
}
    },`
			: ""
	}${
		options.socialProviders.length
			? `socialProviders: ${JSON.stringify(
					options.socialProviders.reduce(
						(acc, provider) => ({
							...acc,
							[provider]: {
								clientId: `process.env.${provider.toUpperCase()}_CLIENT_ID!`,
								clientSecret: `process.env.${provider.toUpperCase()}_CLIENT_SECRET!`,
							},
						}),
						{},
					),
				).replace(/"/g, "")},`
			: ""
	}
  	${
			options.magicLink || options.passkey
				? `plugins: [
  		${
				options.magicLink
					? `magicLink({
        async sendMagicLink(data) {
          // Send an email to the user with a magic link
        },
      }),`
					: `${options.passkey ? `passkey(),` : ""}`
			}
${options.passkey && options.magicLink ? `passkey(),` : ""}],`
				: ""
		}
		/** if no database is provided, the user data will be stored in memory.
	 * Make sure to provide a database to persist user data **/
	});
	`,
		},
		{
			id: "2",
			name: "auth-client.ts",
			content: `import { createAuthClient } from "better-auth/react";${
				options.magicLink
					? `
			import { magicLinkClient } from "better-auth/client/plugins";`
					: ""
			}${
				options.passkey
					? `
			import { passkeyClient } from "@better-auth/passkey/client";`
					: ""
			}

			export const authClient = createAuthClient({
				baseURL: process.env.NEXT_PUBLIC_APP_URL,${
					options.magicLink || options.passkey
						? `
				plugins: [${options.magicLink ? `magicLinkClient()${options.passkey ? "," : ""}` : ""}${
					options.passkey ? `passkeyClient()` : ""
				}],`
						: ""
				}
			});

			export const { signIn, signOut, signUp, useSession } = authClient;
			`,
		},
		{
			id: "3",
			name: "sign-in.tsx",
			content: signInString(options),
		},
	];

	if (options.signUp) {
		files.push({
			id: "4",
			name: "sign-up.tsx",
			content: signUpString(options),
		});
	}

	return files;
}

const signInString = (options: SignInBoxOptions) => `"use client"

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

export default function SignIn() {${
	options.email || options.magicLink
		? `
  const [email, setEmail] = useState("");`
		: ""
}${
	options.email
		? `
	const [password, setPassword] = useState("");`
		: ""
}
	const [loading, setLoading] = useState(false);${
		options.rememberMe
			? `
	const [rememberMe, setRememberMe] = useState(false);`
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
							<Label htmlFor="password">Password</Label>${
								options.requestPasswordReset
									? `
							<Link
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
					</div>${
						options.rememberMe
							? `
					<div className="flex items-center gap-2">
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
					}${
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
									await signIn.magicLink({
										email,
										fetchOptions: {
											onRequest: () => {
												setLoading(true);
											},
											onResponse: () => {
												setLoading(false);
											},
										},
									});
								}}>
									{loading ? (
										<Loader2 size={16} className="animate-spin" />
										):(
												Sign-in with Magic Link
									)}
							</Button>
						</div>`
							: ""
					}${
						options.email
							? `
					<Button
						type="submit"
						className="w-full"
						disabled={loading}
						onClick={async () => {
							await signIn.email({
								email,
								password,${
									options.rememberMe
										? `
								rememberMe,`
										: ""
								}
								fetchOptions: {
									onRequest: () => {
										setLoading(true);
									},
									onResponse: () => {
										setLoading(false);
									},
								},
							});
						}}
					>
						{loading ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							<p>Login</p>
						)}
					</Button>`
							: ""
					}${
						options.passkey
							? `
					<Button
						variant="secondary"
						disabled={loading}
						className="gap-2"
						onClick={async () => {
							await signIn.passkey({
								fetchOptions: {
									onRequest: () => {
										setLoading(true);
									},
									onResponse: () => {
										setLoading(false);
									},
								},
							});
						}}
					>
						<Key size={16} />
						Sign-in with Passkey
					</Button>`
							: ""
					}${
						options.socialProviders?.length > 0
							? `
					<div className={cn(
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
								return `<Button
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
								await signIn.social({
									provider: "${provider}",
									callbackURL: "/dashboard",
									fetchOptions: {
										onRequest: () => {
											setLoading(true);
										},
										onResponse: () => {
											setLoading(false);
										},
									},
								});
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
							.join("\n\t\t\t\t\t\t")}
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

const signUpString = (options: SignInBoxOptions) => `"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Image from "next/image";
import { Loader2, X } from "lucide-react";
import { signUp } from "@/lib/auth-client";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function SignUp() {
	const [firstName, setFirstName] = useState("");
	const [lastName, setLastName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [passwordConfirmation, setPasswordConfirmation] = useState("");
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file) {
			setImage(file);
			const reader = new FileReader();
			reader.onloadend = () => {
				setImagePreview(reader.result as string);
			};
			reader.readAsDataURL(file);
		}
	};

	return (
		<Card className="z-50 rounded-md rounded-t-none max-w-md">
			<CardHeader>
				<CardTitle className="text-lg md:text-xl">Sign Up</CardTitle>
				<CardDescription className="text-xs md:text-sm">
					Enter your information to create an account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="grid gap-2">
							<Label htmlFor="first-name">First name</Label>
							<Input
								id="first-name"
								placeholder="Max"
								required
								onChange={(e) => {
									setFirstName(e.target.value);
								}}
								value={firstName}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="last-name">Last name</Label>
							<Input
								id="last-name"
								placeholder="Robinson"
								required
								onChange={(e) => {
									setLastName(e.target.value);
								}}
								value={lastName}
							/>
						</div>
					</div>
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
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							autoComplete="new-password"
							placeholder="Password"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="password_confirmation">Confirm Password</Label>
						<Input
							id="password_confirmation"
							type="password"
							value={passwordConfirmation}
							onChange={(e) => setPasswordConfirmation(e.target.value)}
							autoComplete="new-password"
							placeholder="Confirm Password"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="image">Profile Image (optional)</Label>
						<div className="flex items-end gap-4">
							{imagePreview && (
								<div className="relative w-16 h-16 rounded-sm overflow-hidden">
									<Image
										src={imagePreview}
										alt="Profile preview"
										layout="fill"
										objectFit="cover"
									/>
								</div>
							)}
							<div className="flex items-center gap-2 w-full">
								<Input
									id="image"
									type="file"
									accept="image/*"
									onChange={handleImageChange}
									className="w-full"
								/>
								{imagePreview && (
									<X
										className="cursor-pointer"
										onClick={() => {
											setImage(null);
											setImagePreview(null);
										}}
									/>
								)}
							</div>
						</div>
					</div>
					<Button
						type="submit"
						className="w-full"
						disabled={loading}
						onClick={async () => {
							await signUp.email({
								email,
								password,
								name: \`\${firstName} \${lastName}\`,
								image: image ? await convertImageToBase64(image) : "",
								callbackURL: "/dashboard",
								fetchOptions: {
									onResponse: () => {
										setLoading(false);
									},
									onRequest: () => {
										setLoading(true);
									},
									onError: (ctx) => {
										toast.error(ctx.error.message);
									},
									onSuccess: () => {
										router.push("/dashboard");
									},
								},
							});
						}}
					>
						{loading ? (
							<Loader2 size={16} className="animate-spin" />
						) : (
							"Create your account"
						)}
					</Button>
				</div>
			</CardContent>
      ${
				options.label
					? `<CardFooter>
				<div className="flex justify-center w-full border-t py-4">
					<p className="text-center text-xs text-neutral-500">
						Secured by <span className="text-orange-400">better-auth.</span>
					</p>
				</div>
			</CardFooter>`
					: ""
			}
		</Card>
	);
}

async function convertImageToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}`;
