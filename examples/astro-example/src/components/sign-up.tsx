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
import { signUp } from "@/libs/auth-client";
import { createSignal } from "solid-js";
import { convertImageToBase64 } from "@/libs/utils";

export function SignUpCard() {
	const [firstName, setFirstName] = createSignal("");
	const [lastName, setLastName] = createSignal("");
	const [email, setEmail] = createSignal("");
	const [password, setPassword] = createSignal("");
	const [image, setImage] = createSignal<File>();
	const [rememberMe, setRememberMe] = createSignal(false);
	return (
		<Card>
			<CardHeader>
				<CardTitle class="text-lg md:text-xl">Sign Up</CardTitle>
				<CardDescription class="text-xs md:text-sm">
					Enter your information to create an account
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="grid gap-4">
					<div class="grid gap-2">
						<div class="flex items-center gap-2">
							<TextFieldRoot class="w-full">
								<TextFieldLabel for="name">First Name</TextFieldLabel>
								<TextField
									type="first-name"
									placeholder="First Name"
									value={firstName()}
									onInput={(e) => {
										if ("value" in e.target)
											setFirstName(e.target.value as string);
									}}
								/>
							</TextFieldRoot>
							<TextFieldRoot class="w-full">
								<TextFieldLabel for="name">Last Name</TextFieldLabel>
								<TextField
									type="last-name"
									placeholder="Last Name"
									value={lastName()}
									onInput={(e) => {
										if ("value" in e.target)
											setLastName(e.target.value as string);
									}}
								/>
							</TextFieldRoot>
						</div>
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
							<TextFieldLabel for="password">Password</TextFieldLabel>
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
						<TextFieldRoot>
							<TextFieldLabel>Image</TextFieldLabel>
							<TextField
								type="file"
								accept="image/*"
								placeholder="Image"
								onChange={(e: any) => {
									const file = e.target.files?.[0];
									if ("value" in e.target) setImage(file);
								}}
							/>
						</TextFieldRoot>
						<Button
							onclick={async () => {
								signUp.email({
									name: `${firstName()} ${lastName()}`,
									image: image()
										? await convertImageToBase64(image()!)
										: undefined,
									email: email(),
									password: password(),
									callbackURL: "/",
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
							Sign Up
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
						<Button class="gap-2" variant="outline">
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
					</div>
					<p class="text-sm text-center">
						Already have an account?{" "}
						<a href="/sign-in" class="text-blue-500">
							Sign In
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
