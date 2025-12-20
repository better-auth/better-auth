"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function Page() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token") ?? "";

	return (
		<div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
			<Card className="w-[350px]">
				<CardHeader>
					<CardTitle>Reset password</CardTitle>
					<CardDescription>
						Enter new password and confirm it to reset your password
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ResetPasswordForm
						token={token}
						onSuccess={() => router.push("/sign-in")}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
