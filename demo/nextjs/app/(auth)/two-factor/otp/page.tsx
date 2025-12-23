"use client";

import { useRouter } from "next/navigation";
import { TwoFactorEmailOtpForm } from "@/components/forms/two-factor-email-otp-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function Page() {
	const router = useRouter();

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
					<TwoFactorEmailOtpForm onSuccess={() => router.push("/dashboard")} />
				</CardContent>
			</Card>
		</main>
	);
}
