"use client";

import { useRouter } from "next/navigation";
import { TwoFactorMethodLinks } from "@/components/forms/two-factor-method-links";
import { TwoFactorRecoveryCodeForm } from "@/components/forms/two-factor-recovery-code-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function Page() {
	const router = useRouter();

	return (
		<main className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card className="w-[350px]">
				<CardHeader>
					<CardTitle>Recovery Code Verification</CardTitle>
					<CardDescription>
						Use one of your saved recovery codes to complete sign-in
					</CardDescription>
				</CardHeader>
				<CardContent>
					<TwoFactorRecoveryCodeForm
						onSuccess={() => router.push("/dashboard")}
					/>
				</CardContent>
				<CardFooter className="text-sm text-muted-foreground gap-2">
					<TwoFactorMethodLinks current="recovery-code" />
				</CardFooter>
			</Card>
		</main>
	);
}
