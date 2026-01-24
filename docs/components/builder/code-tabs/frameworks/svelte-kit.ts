import { socialProviders } from "../../social-provider";
import type { SignInBoxOptions } from "../../store";

export function resolveSvelteKitFiles(options: SignInBoxOptions) {
	const files = [
		{
			id: "1",
			name: "auth.ts",
			content: `import { betterAuth } from "better-auth";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { getRequestEvent } from "$app/server";${
				options.socialProviders.length > 0
					? `
import {
	${options.socialProviders
		.map(
			(provider) => `${provider.toUpperCase()}_CLIENT_ID,
		${provider.toUpperCase()}_CLIENT_SECRET`,
		)
		.join("\n\t")}
} from "$env/static/private";`
					: ""
			}${
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
								clientId: `${provider.toUpperCase()}_CLIENT_ID`,
								clientSecret: `${provider.toUpperCase()}_CLIENT_SECRET`,
							},
						}),
						{},
					),
				).replace(/"/g, "")},`
			: ""
	}
		plugins: [${
			options.magicLink
				? `
			magicLink({
				async sendMagicLink(data) {
					// Send an email to the user with a magic link
				},
			}),`
				: ""
		}${
			options.passkey
				? `
			passkey(),`
				: ""
		}
		sveltekitCookies(getRequestEvent),
	],
	/** if no database is provided, the user data will be stored in memory.
	 * Make sure to provide a database to persist user data **/
});
	`,
		},
		{
			id: "2",
			name: "auth-client.ts",
			content: `import { createAuthClient } from "better-auth/svelte";
			import { PUBLIC_APP_URL } from "$env/static/public";${
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
				baseURL: PUBLIC_APP_URL,${
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
			name: "sign-in.svelte",
			content: signInString(options),
		},
	];

	if (options.signUp) {
		files.push({
			id: "4",
			name: "sign-up.svelte",
			content: signUpString(options),
		});
	}

	return files;
}

const signInString = (options: SignInBoxOptions) => `<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Checkbox } from "$lib/components/ui/checkbox/index.js";
	import { Loader2, Key } from "@lucide/svelte";
	import { signIn } from "$lib/auth-client.js";
	import { cn } from "$lib/utils.js";
	${
		options.email || options.magicLink
			? `
	let email = $state("");`
			: ""
	}${
		options.email
			? `
	let password = $state("");`
			: ""
	}
	let loading = $state(false);${
		options.rememberMe
			? `
	let rememberMe = $state(false);`
			: ""
	}
</script>

<Card class="max-w-md">
	<CardHeader>
		<CardTitle class="text-lg md:text-xl">Sign In</CardTitle>
		<CardDescription class="text-xs md:text-sm">
			Enter your email below to login to your account
		</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="grid gap-4">
			${
				options.email
					? `<div class="grid gap-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					placeholder="m@example.com"
					required
					bind:value={email}
				/>
			</div>

			<div class="grid gap-2">
				<div class="flex items-center">
					<Label for="password">Password</Label>${
						options.requestPasswordReset
							? `
					<a
						href="#"
						class="ml-auto inline-block text-sm underline"
					>
						Forgot your password?
					</a>`
							: ""
					}
				</div>

				<Input
					id="password"
					type="password"
					placeholder="password"
					autocomplete="password"
					bind:value={password}
				/>
			</div>${
				options.rememberMe
					? `
			<div class="flex items-center gap-2">
				<Checkbox
					id="remember"
					bind:checked={rememberMe}
				/>
				<Label for="remember">Remember me</Label>
			</div>`
					: ""
			}`
					: ""
			}${
				options.magicLink
					? `<div class="grid gap-2">
					<Label for="email">Email</Label>
					<Input
						id="email"
						type="email"
						placeholder="m@example.com"
						required
						bind:value={email}
					/>
					<Button
						disabled={loading}
						onclick={async () => {
							await signIn.magicLink({
								email,
								fetchOptions: {
									onRequest: () => {
										loading = true;
									},
									onResponse: () => {
										loading = false;
									},
								},
							});
						}}
					>
						{#if loading}
							<Loader2 size={16} class="animate-spin" />
						{:else}
							<span>Sign-in with Magic Link</span>
						{/if}
					</Button>
				</div>`
					: ""
			}${
				options.email
					? `
			<Button
				type="submit"
				class="w-full"
				disabled={loading}
				onclick={async () => {
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
								loading = true;
							},
							onResponse: () => {
								loading = false;
							},
						},
					});
				}}
			>
				{#if loading}
					<Loader2 size={16} class="animate-spin" />
				{:else}
					<p>Login</p>
				{/if}
			</Button>`
					: ""
			}${
				options.passkey
					? `
			<Button
				variant="secondary"
				disabled={loading}
				class="gap-2"
				onclick={async () => {
					await signIn.passkey({
						fetchOptions: {
							onRequest: () => {
								loading = true;
							},
							onResponse: () => {
								loading = false;
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
			<div class={cn(
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
					class=${
						options.socialProviders.length > 3
							? '"flex-grow"'
							: '"w-full gap-2"'
					}
					disabled={loading}
					onclick={async () => {
						await signIn.social({
							provider: "${provider}",
							callbackURL: "/dashboard",
							fetchOptions: {
								onRequest: () => {
									loading = true;
								},
								onResponse: () => {
									loading = false;
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
					.join("\n\t\t\t\t")}
			</div>`
					: ""
			}
		</div>
	</CardContent>
	${
		options.label
			? `<CardFooter>
		<div class="flex justify-center w-full border-t py-4">
			<p class="text-center text-xs text-neutral-500">
				built with&nbsp;
				<a
					href="https://better-auth.com"
					class="underline"
					target="_blank"
				>
					<span class="dark:text-white/70 cursor-pointer">
						better-auth.
					</span>
				</a>
			</p>
		</div>
	</CardFooter>`
			: ""
	}
</Card>
`;

const signUpString = (options: SignInBoxOptions) => `<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle,
	} from "$lib/components/ui/card/index.js";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import { Loader2, X } from "@lucide/svelte";
	import { signUp } from "$lib/auth-client.js";
	import { toast } from "svelte-sonner";
	import { goto } from "$app/navigation";

	let firstName = $state("");
	let lastName = $state("");
	let email = $state("");
	let password = $state("");
	let passwordConfirmation = $state("");
	let image = $state<File | null>(null);
	let imagePreview = $state<string | null>(null);
	let loading = $state(false);

	async function convertImageToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	const handleImageChange = (e: Event) => {
		const file = (e.target as HTMLInputElement)?.files?.[0];
		if (file) {
			image.value = file;
			const reader = new FileReader();
			reader.onloadend = () => {
				imagePreview.value = reader.result as string;
			};
			reader.readAsDataURL(file);
		}
	};
</script>

<Card class="z-50 rounded-md rounded-t-none max-w-md">
	<CardHeader>
		<CardTitle class="text-lg md:text-xl">Sign Up</CardTitle>
		<CardDescription class="text-xs md:text-sm">
			Enter your information to create an account
		</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="grid gap-4">
			<div class="grid grid-cols-2 gap-4">
				<div class="grid gap-2">
					<Label for="first-name">First Name</Label>
					<Input
						id="first-name"
						placeholder="Max"
						required
						bind:value={firstName}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="last-name">Last Name</Label>
					<Input
						id="last-name"
						placeholder="Robinson"
						required
						bind:value={lastName}
					/>
				</div>
			</div>
			<div class="grid gap-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					placeholder="m@example.com"
					required
					bind:value={email}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					type="password"
					placeholder="Password"
					autocomplete="new-password"
					bind:value={password}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="password_confirmation">Confirm Password</Label>
				<Input
					id="password_confirmation"
					type="password"
					placeholder="Confirm Password"
					autocomplete="new-password"
					bind:value={passwordConfirmation}
				/>
			</div>
			<div class="grid gap-2">
				<Label for="image">Profile Image (optional)</Label>
				<div class="flex items-end gap-4">
					{#if imagePreview}
						<div class="relative w-16 h-16 rounded-sm overflow-hidden">
							<img
								src={imagePreview}
								alt="Profile preview
								class="object-cover"
							/>
						</div>
					{/if}
					<div class="flex items-center gap-2 w-full">
						<Input
							id="image"
							type="file"
							accept="image/*"
							onchange={handleImageChange}
							class="w-full"
						/>
						{#if imagePreview}
							<X
								class="cursor-pointer"
								onclick={() => {
									image = null;
									imagePreview = null;
								}}
							/>
						{/if}
					</div>
				</div>
			</div>
			<Button
				type="submit"
				class="w-full"
				disabled={loading}
				onclick={async () => {
					await signUp.email({
						email,
						password,
						name: \`\${firstName} \${lastName}\`,
						image: image ? await convertImageToBase64(image) : "",
						callbackURL: "/dashboard",
						fetchOptions: {
							onResponse: () => {
								loading = false;
							},
							onRequest: () => {
								loading = true;
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
				{#if loading}
					<Loader2 size={16} class="animate-spin" />
				{:else}
					<span>Create your Account</span>
				{/if}
			</Button>
		</div>
	</CardContent>${
		options.label
			? `
	<CardFooter>
		<div class="flex justify-center w-full border-t py-4">
			<p class="text-center text-xs text-neutral-500">
				Secured by <span class="text-orange-400">better-auth.</span>
			</p>
		</div>
	</CardFooter>`
			: ""
	}
</Card>`;
