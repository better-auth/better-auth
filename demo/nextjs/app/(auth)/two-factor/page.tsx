"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
	ElectronTwoFactorResult,
	useTwoFactorCompletion,
} from "@/components/electron-two-factor-result";
import { TwoFactorTotpForm } from "@/components/forms/two-factor-totp-form";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

// The completion hook reads search params, which needs a Suspense boundary
// for static prerendering.
export default function Page() {
	return (
		<Suspense>
			<TwoFactorTotp />
		</Suspense>
	);
}

function TwoFactorTotp() {
	const { result, onSuccess, request } = useTwoFactorCompletion();
	const params = useSearchParams();

	return (
		<main className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card className="w-[350px]">
				<CardHeader>
					<CardTitle>TOTP Verification</CardTitle>
					<CardDescription>
						Enter your 6-digit TOTP code to authenticate
					</CardDescription>
				</CardHeader>
				<CardContent>
					{result ? (
						<ElectronTwoFactorResult code={result.code} />
					) : (
						<TwoFactorTotpForm key={request} onSuccess={onSuccess} />
					)}
				</CardContent>
				<CardFooter className="text-sm text-muted-foreground gap-2">
					<Link href={`/two-factor/otp?${params.toString()}`}>
						<Button variant="link" size="sm">
							Switch to Email Verification
						</Button>
					</Link>
				</CardFooter>
			</Card>
		</main>
	);
}
