"use client";

import { Suspense } from "react";
import {
	ElectronTwoFactorResult,
	useTwoFactorCompletion,
} from "@/components/electron-two-factor-result";
import { TwoFactorEmailOtpForm } from "@/components/forms/two-factor-email-otp-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

// The completion hook reads search params, which needs a Suspense boundary
// for static prerendering.
export default function Page() {
	return (
		<Suspense>
			<TwoFactorOtp />
		</Suspense>
	);
}

function TwoFactorOtp() {
	const { result, onSuccess, request } = useTwoFactorCompletion();

	return (
		<main className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card className="w-[350px]">
				<CardHeader>
					<CardTitle>Two-Factor Authentication</CardTitle>
					<CardDescription>
						Verify your identity with a one-time password
					</CardDescription>
				</CardHeader>
				<CardContent>
					{result ? (
						<ElectronTwoFactorResult code={result.code} />
					) : (
						<TwoFactorEmailOtpForm key={request} onSuccess={onSuccess} />
					)}
				</CardContent>
			</Card>
		</main>
	);
}
