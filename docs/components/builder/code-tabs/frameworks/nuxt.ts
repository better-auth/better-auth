import { socialProviders } from "../../social-provider";
import type { SignInBoxOptions } from "../../store";

export function resolveNuxtFiles(options: SignInBoxOptions) {
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
			name: "sign-in.vue",
			content: signInString(options),
		},
	];
	if (options.signUp) {
		files.push({
			id: "4",
			name: "sign-up.vue",
			content: signUpString(options),
		});
	}

	return files;
}

const signInString = (options: SignInBoxOptions) => `<script setup lang="ts">
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Checkbox } from "~/components/ui/checkbox";
import { Loader2, Key } from "lucide-vue";
import { signIn } from "~/lib/auth-client";
import { cn } from "~/lib/utils";
${
	options.email || options.magicLink
		? `
const email = ref("");`
		: ""
}${
	options.email
		? `
const password = ref("");`
		: ""
}
const loading = ref(false);${
	options.rememberMe
		? `
const rememberMe = ref(false);`
		: ""
}${
	options.email
		? `

const handleSignIn = async () => {
	await signIn.email({
		email: email.value,
		password: password.value,${
			options.rememberMe
				? `
		rememberMe: rememberMe.value,`
				: ""
		}
		fetchOptions: {
			onRequest: () => {
			  loading.value = true;
			},
			onResponse: () => {
				loading.value = false;
			},
		},
	});
};`
		: ""
}${
	options.magicLink
		? `

const handleMagicLink = async () => {
	await signIn.magicLink({
		email: email.value,
		fetchOptions: {
			onRequest: () => {
				loading.value = true;
			},
			onResponse: () => {
				loading.value = false;
			},
		},
	});
};
`
		: ""
}${
	options.passkey
		? `

const handlePasskey = async () => {
	await signIn.passkey({
	  fetchOptions: {
			onRequest: () => {
				loading.value = true;
			},
			onResponse: () => {
				loading.value = false;
			},
		},
	});
};`
		: ""
}${
	options.socialProviders.length > 0
		? `

const handleSocialSignIn = async (provider: string) => {
	await signIn.social({
		provider,
		callbackURL: "/dashboard",
		fetchOptions: {
			onRequest: () => {
				loading.value = true;
			},
			onResponse: () => {
				loading.value = false;
			},
		},
	});
}`
		: ""
}
</script>

<template>
	<Card class="max-w-md">
		<CardHeader>
			<CardTitle class="text-xs md:text-sm>Sign In</CardTitle>
			<CardDescription>
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
						v-model="email"
					/>
				</div>

				<div class="grid gap-2">
					<div class="flex items-center">
						<Label for="password">Password</Label>${
							options.requestPasswordReset
								? `
						<NuxtLink
							to="#"
							class="ml-auto inline-block text-sm underline"
						>
							Forgot your password?
						</NuxtLink>`
								: ""
						}
					</div>

					<Input
						id="password"
						type="password"
						placeholder="password"
						autoComplete="password"
						v-model="password"
					/>
				</div>${
					options.rememberMe
						? `
				<div class="flex items-center gap-2">
					<Checkbox
						id="remember"
						v-model="rememberMe"
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
						v-model="email"
					/>
					<Button
						:disabled="loading"
						class="gap-2"
						@click="handleMagicLink"
					>
						<Loader2 size="16" class="animate-spin" v-if="loading" />
						<span v-else>
							Sign-in with Magic Link
						</span>
					</Button>
				</div>`
						: ""
				}${
					options.email
						? `
				<Button
					type="submit"
					class="w-full"
					:disabled="loading"
					@click="handleSignIn"
				>
					<Loader2 size="16" class="animate-spin" v-if="loading" />
					<p v-else>Login</p>
				</Button>`
						: ""
				}${
					options.passkey
						? `
				<Button
					variant="secondary"
					:disabled="loading"
					class="gap-2"
					@click="handlePasskey"
				>
					<Key size="16" />
					Sign-in with Passkey
				</Button>`
						: ``
				}${
					options.socialProviders.length > 0
						? `
				<div :class="cn(
					'w-full gap-2 flex items-center',
					${
						options.socialProviders.length > 3
							? "'justify-between flex-wrap'"
							: "'justify-between flex-col'"
					}
				)">
					${options.socialProviders
						.map((provider: string) => {
							const icon =
								socialProviders[provider as keyof typeof socialProviders]
									?.stringIcon || "";
							return `<Button
						variant="outline"
						:class="cn(
							${
								options.socialProviders.length > 3
									? "'flex-grow'"
									: "'w-full gap-2'"
							}
						)"
						:disabled="loading"
						@click="handleSocialSignIn('${provider}')"
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
						.join("\n\t\t\t\t\t")}
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
					built with
					<NuxtLink
						to="https://better-auth.com"
						target="_blank"
						class="underline"
					>
						<span class="dark:text-white/70 cursor-pointer">
							better-auth.
						</span>
					</NuxtLink>
				</p>
			</div>
		</CardFooter>`
				: ""
		}
	</Card>
</template>
`;

const signUpString = (options: SignInBoxOptions) => `<script setup lang="ts">
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Loader2, X } from "lucide-vue";
import { signUp } from "~/lib/auth-client";
import { toast } from "vue-sonner";
import { cn } from "~/lib/utils";

const router = useRouter();

const firstName = ref("");
const lastName = ref("");
const email = ref("");
const password = ref("");
const passwordConfirmation = ref("");
const image = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const loading = ref(false);

async function convertImageToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

const handleSignUp = async () => {
	await signUp.email({
		email: email.value,
		password: password.value,
		name: \`\${firstName.value} \${lastName.value}\`,
		image: image.value ? await convertImageToBase64(image.value) : "",
		callbackURL: "/dashboard",
		fetchOptions: {
			onResponse: () => {
				loading.value = false;
			},
			onRequest: () => {
				loading.value = true;
			},
			onError: (ctx) => {
				toast.error(ctx.error.message);
			},
			onSuccess: () => {
				router.push("/dashboard");
			},
		},
	})
};

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

<template>
	<Card class="z-50 rounded-md rounded-t-none max-w-md">
		<CardHeader>
			<CardTitle class="text-lg md:text-xl">Sign Up</CardTitle>
			<CardDescription>
				Enter your information to create an account
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="grid gap-4">
				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="first-name">First name</Label>
						<Input
							id="first-name"
							placeholder="Max"
							required
							v-model="firstName"
						/>
					</div>
					<div class="grid gap-2">
						<Label for="last-name">Last name</Label>
						<Input
							id="last-name"
							placeholder="Robinson"
							required
							v-model="lastName"
						/>
					</div>
					<div class="grid gap-2">
						<Label for="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="m@example.com"
							required
							v-model="email"
						/>
					</div>
					<div class="grid gap-2">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							placeholder="Password"
							autocomplete="new-password"
							v-model="password"
						/>
					</div>
					<div class="grid gap-2">
						<Label for="password_confirmation">Confirm Password</Label>
						<Input
							id="password_confirmation"
							type="password"
							autocomplete="new-password"
							placeholder="Confirm Password"
							v-model="passwordConfirmation"
						/>
					</div>
					<div class="grid gap-2">
						<Label for="image">Profile Image (optional)</Label>
						<div class="flex items-end gap-4">
							<div v-if="imagePreview" class="relative w-16 h-16 rounded-sm overflow-hidden">
								<NuxtImg
									:src="imagePreview"
									alt="Profile preview"
									class="object-cover"
								/>
							</div>
							<div class="flex items-center gap-2 w-full">
								<Input
									id="image"
									type="file"
									accept="image/*"
									@change="handleImageChange"
									class="w-full"
								/>
								<X
									class="cursor-pointer"
									@click="image = null; imagePreview = null"
								/>
							</div>
						</div>
					</div>
					<Button
						type="submit"
						class="w-full"
						:disabled="loading"
						@click="handleSignUp"
					>
						<Loader2 size="16" class="animate-spin" v-if="loading" />
						<span v-else>Create your account</span>
					</Button>
				</div>
			</div>
		</CardContent>
		${
			options.label
				? `<CardFooter>
			<div class="flex justify-center w-full border-t py-4">
				<p class="text-center text-xs text-neutral-500">
					Secured by <span class="text-orange-400">better-auth.</span>
				</p>
			</div>
		</CardFooter>`
				: ""
		}
	</Card>
</template>
`;
