import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { TextField, TextFieldLabel, TextFieldRoot } from "./ui/textfield";
import { Button } from "./ui/button";
import { Checkbox, CheckboxControl, CheckboxLabel } from "./ui/checkbox";
import { signIn } from "@/libs/auth-client";
import { createSignal } from "solid-js";

export function SignInCard() {
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [rememberMe, setRememberMe] = createSignal(false);
	return (
		<Card class="max-w-max">
			<CardHeader>
				<CardTitle class="text-lg md:text-xl">Sign In</CardTitle>
				<CardDescription class="text-xs md:text-sm">
					Enter your email below to login to your account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid gap-4">
					<div class="grid gap-2">
						<TextFieldRoot class="w-full">
							<TextFieldLabel for="email">Email</TextFieldLabel>
							<TextField
								type="email"
								placeholder="Email"
								value={email()}
								onInput={(e) => {
									if ("value" in e.target) setEmail(e.target.value as string);
								}}
							/>
						</TextFieldRoot>
						<TextFieldRoot class="w-full">
							<div class="flex items-center justify-between">
								<TextFieldLabel for="password">Password</TextFieldLabel>
								<a
									href="/forget-password"
									class="ml-auto inline-block text-sm underline"
								>
									Forgot your password?
								</a>
							</div>
							<TextField
								type="password"
								placeholder="Password"
								value={password()}
								onInput={(e) => {
									if ("value" in e.target)
										setPassword(e.target.value as string);
								}}
							/>
						</TextFieldRoot>
						<Checkbox
							class="flex items-center gap-2 z-50"
							onChange={(e) => {
								setRememberMe(e);
							}}
							checked={rememberMe()}
						>
							<CheckboxControl />
							<CheckboxLabel class="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
								Remember Me
							</CheckboxLabel>
						</Checkbox>
						<Button
							onclick={() => {
								signIn.email({
									email: email(),
									password: password(),
									rememberMe: rememberMe(),
									fetchOptions: {
										onError(context) {
											alert(context.error.message);
										},
									},
									callbackURL: "/",
								});
							}}
						>
							Sign In
						</Button>
						<Button class="gap-2" variant="outline">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.2em"
								height="1.2em"
								viewBox="0 0 24 24"
							>
								<path
									fill="currentColor"
									d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"
								></path>
							</svg>
							Continue with GitHub
						</Button>
						<Button
							class="gap-2"
							variant="outline"
							onClick={async () => {
								await signIn.social({
									provider: "google",
									callbackURL: "/dashboard",
								});
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="1.2em"
								height="1.2em"
								viewBox="0 0 512 512"
							>
								<path
									fill="currentColor"
									d="m473.16 221.48l-2.26-9.59H262.46v88.22H387c-12.93 61.4-72.93 93.72-121.94 93.72c-35.66 0-73.25-15-98.13-39.11a140.08 140.08 0 0 1-41.8-98.88c0-37.16 16.7-74.33 41-98.78s61-38.13 97.49-38.13c41.79 0 71.74 22.19 82.94 32.31l62.69-62.36C390.86 72.72 340.34 32 261.6 32c-60.75 0-119 23.27-161.58 65.71C58 139.5 36.25 199.93 36.25 256s20.58 113.48 61.3 155.6c43.51 44.92 105.13 68.4 168.58 68.4c57.73 0 112.45-22.62 151.45-63.66c38.34-40.4 58.17-96.3 58.17-154.9c0-24.67-2.48-39.32-2.59-39.96"
								></path>
							</svg>
							Continue with Google
						</Button>
						<Button
							class="gap-2"
							variant="outline"
							onClick={async () => {
								await signIn.passkey({
									fetchOptions: {
										onError(context) {
											alert(context.error.message);
										},
										onSuccess(context) {
											window.location.href = "/";
										},
									},
								});
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
								class="lucide lucide-key"
							>
								<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
								<path d="m21 2-9.6 9.6" />
								<circle cx="7.5" cy="15.5" r="5.5" />
							</svg>
							Sign-In with Passkey
						</Button>
					</div>
					<p class="text-sm text-center">
						Don't have an account yet?{" "}
						<a
							href="/sign-up"
							class="text-blue-900 dark:text-orange-200 underline"
						>
							Sign Up
						</a>
					</p>
				</div>
			</CardContent>
			<CardFooter class="flex-col">
				<div class="flex justify-center w-full border-t py-4">
					<p class="text-center text-xs text-neutral-500">
						Secured by{" "}
						<span class="text-orange-900 dark:text-orange-200">
							better-auth.
						</span>
					</p>
				</div>
			</CardFooter>
		</Card>
	);
}
