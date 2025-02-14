"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { client } from "@/lib/auth-client";
import { AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export default function ResetPassword() {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const router = useRouter();
	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setIsSubmitting(true);
		setError("");
		const res = await client.resetPassword({
			newPassword: password,
			token: new URLSearchParams(window.location.search).get("token")!,
		});
		if (res.error) {
			toast.error(res.error.message);
		}
		setIsSubmitting(false);
		router.push("/sign-in");
	}
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
					<form onSubmit={handleSubmit}>
						<div className="grid w-full items-center gap-2">
							<div className="flex flex-col space-y-1.5">
								<Label htmlFor="email">New password</Label>
								<PasswordInput
									id="password"
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									autoComplete="password"
									placeholder="Password"
								/>
							</div>
							<div className="flex flex-col space-y-1.5">
								<Label htmlFor="email">Confirm password</Label>
								<PasswordInput
									id="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									autoComplete="password"
									placeholder="Password"
								/>
							</div>
						</div>
						{error && (
							<Alert variant="destructive" className="mt-4">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<Button
							className="w-full mt-4"
							type="submit"
							disabled={isSubmitting}
						>
							{isSubmitting ? "Resetting..." : "Reset password"}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
