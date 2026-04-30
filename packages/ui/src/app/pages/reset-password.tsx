import { useState } from "react";
import { authClient } from "@/app/api";
import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
} from "@/components";
import { useConfig } from "@/config";

export function ResetPasswordPage() {
	const config = useConfig();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [loading, setLoading] = useState(false);

	const params = new URLSearchParams(window.location.search);
	const token = params.get("token");

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const password = formData.get("password") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (password !== confirmPassword) {
			setError("Passwords do not match");
			setLoading(false);
			return;
		}

		if (password.length < config.minPasswordLength) {
			setError(
				`Password must be at least ${config.minPasswordLength} characters`,
			);
			setLoading(false);
			return;
		}

		const { error } = await authClient.resetPassword({
			token: token!,
			newPassword: password,
		});

		if (error) {
			setError(error.message);
			setLoading(false);
			return;
		}

		setSuccess(true);
		setLoading(false);
	}

	if (!token) {
		return (
			<Card className="w-full max-w-md mx-auto">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
					<CardDescription>
						This password reset link is invalid or has expired.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						className="w-full"
						onClick={() => (window.location.href = config.paths.forgotPassword)}
					>
						Request New Reset Link
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (success) {
		return (
			<Card className="w-full max-w-md mx-auto">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className="rounded-full bg-primary/10 p-3">
							<svg
								className="size-6 text-primary"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
								<polyline points="22,4 12,14.01 9,11.01" />
							</svg>
						</div>
					</div>
					<CardTitle className="text-2xl">Password Reset!</CardTitle>
					<CardDescription>
						Your password has been successfully reset.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						className="w-full"
						onClick={() => (window.location.href = config.paths.signIn)}
					>
						Sign In
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full max-w-md mx-auto">
			<CardHeader className="text-center">
				<div className="flex items-center justify-center gap-3 mb-2">
					{config.logo && (
						<img src={config.logo} className="h-8 w-8" alt={config.appName} />
					)}
					<span className="text-xl font-semibold">{config.appName}</span>
				</div>
				<CardTitle className="text-2xl">Reset your password</CardTitle>
				<CardDescription>Enter your new password below.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<form onSubmit={handleSubmit} className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="password">New Password</Label>
						<Input
							id="password"
							type="password"
							name="password"
							placeholder="Enter new password"
							required
							autoComplete="new-password"
							minLength={config.minPasswordLength}
							disabled={loading}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="confirmPassword">Confirm Password</Label>
						<Input
							id="confirmPassword"
							type="password"
							name="confirmPassword"
							placeholder="Confirm new password"
							required
							autoComplete="new-password"
							disabled={loading}
						/>
					</div>
					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Resetting..." : "Reset Password"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
