import { useState } from "react";
import { authClient } from "@/app/api";
import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
	Input,
	Label,
} from "@/components";
import { useConfig } from "@/config";

export function ForgotPasswordPage() {
	const config = useConfig();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;

		const { error } = await authClient.forgetPassword({
			email,
			redirectTo: config.paths.resetPassword,
		});

		if (error) {
			setError(error.message);
			setLoading(false);
			return;
		}

		setSuccess(true);
		setLoading(false);
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
								<path d="M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5" />
								<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
								<path d="M18 15.28c.35-.14.74-.18 1.12-.13 1.12.12 1.88 1.21 1.88 2.53 0 1.59-.89 2.32-2 2.32-.63 0-1.22-.25-1.67-.67" />
								<path d="M18 21.28c.35.14.74.18 1.12.13 1.12-.12 1.88-1.21 1.88-2.53 0-1.59-.89-2.32-2-2.32-.63 0-1.22.25-1.67.67" />
							</svg>
						</div>
					</div>
					<CardTitle className="text-2xl">Check your email</CardTitle>
					<CardDescription>
						If an account exists with that email, we've sent password reset
						instructions.
					</CardDescription>
				</CardHeader>
				<CardContent>
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
				<CardTitle className="text-2xl">Forgot your password?</CardTitle>
				<CardDescription>
					Enter your email and we'll send you a reset link.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<form onSubmit={handleSubmit} className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							name="email"
							placeholder="Enter your email address"
							required
							autoComplete="email"
							disabled={loading}
						/>
					</div>
					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "Sending..." : "Send Reset Link"}
					</Button>
				</form>
			</CardContent>
			<CardFooter className="justify-center text-sm text-muted-foreground">
				Remember your password?{" "}
				<a
					href={config.paths.signIn}
					className="text-primary hover:underline ml-1"
				>
					Sign in
				</a>
			</CardFooter>
		</Card>
	);
}
