"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export default function Page() {
	const router = useRouter();

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
					<TwoFactorTotpForm onSuccess={() => router.push("/dashboard")} />
				</CardContent>
				<CardFooter className="text-sm text-muted-foreground gap-2">
					<Link href="/two-factor/otp">
						<Button variant="link" size="sm">
							Switch to Email Verification
						</Button>
					</Link>
				</CardFooter>
			</Card>
		</main>
	);
}
