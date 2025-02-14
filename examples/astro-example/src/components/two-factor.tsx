import { createEffect, createSignal, Show } from "solid-js";
import { Button } from "./ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	OTPField,
	OTPFieldGroup,
	OTPFieldInput,
	OTPFieldSlot,
} from "./ui/otp-field";
import { twoFactorActions } from "@/libs/auth-client";

export function TwoFactorComponent() {
	const [otp, setOTP] = createSignal("");

	createEffect(() => {
		if (otp().length === 6) {
			twoFactorActions.verifyTotp({
				code: otp(),
				fetchOptions: {
					onError(context) {
						if (context.error.status === 429) {
							const retryAfter = context.response.headers.get("X-Retry-After");
							alert(
								`Too many requests. Please try again after ${retryAfter} seconds`,
							);
						} else {
							alert(
								context.error.message ||
									context.error.statusText ||
									context.error.status,
							);
						}
					},
				},
			});
		}
	});
	return (
		<main class="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card class="w-[350px]">
				<CardHeader>
					<CardTitle>TOTP Verification</CardTitle>
					<CardDescription>
						Enter your 6-digit TOTP code to authenticate
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div class="flex flex-col gap-2  items-center">
						<OTPField
							maxLength={6}
							value={otp()}
							onValueChange={(value) => {
								setOTP(value);
							}}
						>
							<OTPFieldInput />
							<OTPFieldGroup>
								<OTPFieldSlot index={0} />
								<OTPFieldSlot index={1} />
								<OTPFieldSlot index={2} />
								<OTPFieldSlot index={3} />
								<OTPFieldSlot index={4} />
								<OTPFieldSlot index={5} />
							</OTPFieldGroup>
						</OTPField>
						<span class="text-center text-xs">
							Enter your one-time password.
						</span>
					</div>
					<div class="flex justify-center">
						<a
							href="/two-factor/email"
							class="text-xs border-b pb-1 mt-2  w-max hover:border-black transition-all"
						>
							Switch to Email Verification
						</a>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}

export function TwoFactorEmail() {
	const [otp, setOTP] = createSignal("");

	createEffect(() => {
		if (otp().length === 6) {
			twoFactorActions.verifyOtp({
				code: otp(),
				fetchOptions: {
					onError(context) {
						alert(context.error.message);
					},
					onSuccess(context) {
						window.location.href = "/dashboard";
					},
				},
			});
		}
	});
	const [sentEmail, setSentEmail] = createSignal(false);
	return (
		<main class="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card class="w-[350px]">
				<CardHeader>
					<CardTitle>Email Verification</CardTitle>
					<CardDescription>
						Enter your 6-digit TOTP code to authenticate
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Show
						when={sentEmail()}
						fallback={
							<Button
								onClick={async () => {
									await twoFactorActions.sendOtp({
										fetchOptions: {
											onSuccess(context) {
												setSentEmail(true);
											},
											onError(context) {
												alert(context.error.message);
											},
										},
									});
								}}
								class="w-full gap-2"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="1.2em"
									height="1.2em"
									viewBox="0 0 24 24"
								>
									<path
										fill="currentColor"
										d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h16q.825 0 1.413.588T22 6v12q0 .825-.587 1.413T20 20zm8-7.175q.125 0 .263-.038t.262-.112L19.6 8.25q.2-.125.3-.312t.1-.413q0-.5-.425-.75T18.7 6.8L12 11L5.3 6.8q-.45-.275-.875-.012T4 7.525q0 .25.1.438t.3.287l7.075 4.425q.125.075.263.113t.262.037"
									></path>
								</svg>{" "}
								Send OTP to Email
							</Button>
						}
					>
						<div class="flex flex-col gap-2  items-center">
							<OTPField
								maxLength={6}
								value={otp()}
								onValueChange={(value) => {
									setOTP(value);
								}}
							>
								<OTPFieldInput />
								<OTPFieldGroup>
									<OTPFieldSlot index={0} />
									<OTPFieldSlot index={1} />
									<OTPFieldSlot index={2} />
									<OTPFieldSlot index={3} />
									<OTPFieldSlot index={4} />
									<OTPFieldSlot index={5} />
								</OTPFieldGroup>
							</OTPField>
							<span class="text-center text-xs">
								Enter your one-time password.
							</span>
						</div>
					</Show>
					<div class="flex justify-center">
						<a
							href="/two-factor"
							class="text-xs border-b pb-1 mt-2  w-max hover:border-black transition-all"
						>
							Switch to TOTP Verification
						</a>
					</div>
				</CardContent>
			</Card>
		</main>
	);
}
