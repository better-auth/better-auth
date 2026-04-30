import { useEffect, useState } from "react";
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
} from "@/components";
import { useConfig } from "@/config";

type Status = "loading" | "success" | "error" | "pending";

export function VerifyEmailPage() {
	const config = useConfig();
	const [status, setStatus] = useState<Status>("pending");
	const [error, setError] = useState<string | null>(null);
	const [resending, setResending] = useState(false);

	const params = new URLSearchParams(window.location.search);
	const token = params.get("token");
	const email = params.get("email");

	useEffect(() => {
		if (token) {
			verifyEmail(token)
				.then()
				.catch((err) => {
					throw err;
				});
		}
	}, [token]);

	async function verifyEmail(verifyToken: string) {
		setStatus("loading");
		setError(null);

		const { error } = await authClient.verifyEmail({ token: verifyToken });

		if (error) {
			setStatus("error");
			setError(error.message);
			return;
		}

		setStatus("success");
	}

	async function handleResend() {
		if (!email) return;

		setResending(true);
		setError(null);

		const { error } = await authClient.sendVerificationEmail({ email });

		if (error) {
			setError(error.message);
			setResending(false);
			return;
		}

		setResending(false);
		alert("Verification email sent!");
	}

	if (status === "loading") {
		return (
			<Card className="w-full max-w-md mx-auto">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
					</div>
					<CardTitle className="text-2xl">Verifying your email...</CardTitle>
					<CardDescription>
						Please wait while we verify your email address.
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (status === "success") {
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
					<CardTitle className="text-2xl">Email Verified!</CardTitle>
					<CardDescription>
						Your email has been successfully verified. You can now sign in.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						className="w-full"
						onClick={() => (window.location.href = config.redirectTo)}
					>
						Continue
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (status === "error" && token) {
		return (
			<Card className="w-full max-w-md mx-auto">
				<CardHeader className="text-center">
					<div className="flex justify-center mb-4">
						<div className="rounded-full bg-destructive/10 p-3">
							<svg
								className="size-6 text-destructive"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="15" y1="9" x2="9" y2="15" />
								<line x1="9" y1="9" x2="15" y2="15" />
							</svg>
						</div>
					</div>
					<CardTitle className="text-2xl">Verification Failed</CardTitle>
					<CardDescription>
						{error || "This verification link is invalid or has expired."}
					</CardDescription>
				</CardHeader>
				<CardContent className="grid gap-2">
					{email && (
						<Button
							className="w-full"
							onClick={handleResend}
							disabled={resending}
						>
							{resending ? "Sending..." : "Resend Verification Email"}
						</Button>
					)}
					<Button
						className="w-full"
						variant="outline"
						onClick={() => (window.location.href = config.paths.signIn)}
					>
						Back to Sign In
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
				<div className="flex justify-center mb-4">
					<div className="rounded-full bg-primary/10 p-3">
						<svg
							className="size-6 text-primary"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<rect x="2" y="4" width="20" height="16" rx="2" />
							<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
						</svg>
					</div>
				</div>
				<CardTitle className="text-2xl">Check your email</CardTitle>
				<CardDescription>
					We've sent a verification link to{" "}
					{email ? <strong>{email}</strong> : "your email"}. Click the link to
					verify your account.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{error && (
					<Alert variant="destructive" className="mb-2">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				{email && (
					<Button
						className="w-full"
						variant="outline"
						onClick={handleResend}
						disabled={resending}
					>
						{resending ? "Sending..." : "Resend Verification Email"}
					</Button>
				)}
				<Button
					className="w-full"
					variant="ghost"
					onClick={() => (window.location.href = config.paths.signIn)}
				>
					Back to Sign In
				</Button>
			</CardContent>
		</Card>
	);
}
