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
	Separator,
	SocialButtons,
} from "@/components";
import { useConfig } from "@/config";

export function SignUpPage() {
	const config = useConfig();
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const hasSocial = config.socialProviders.length > 0;
	const showDivider = hasSocial && config.features.emailPassword;

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
		setLoading(true);

		const formData = new FormData(e.currentTarget);
		const name = formData.get("name") as string;
		const email = formData.get("email") as string;
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

		const { error } = await authClient.signUp.email({
			name,
			email,
			password,
		});

		if (error) {
			setError(error.message);
			setLoading(false);
			return;
		}

		if (config.features.emailVerification) {
			window.location.href = `${config.paths.verifyEmail}?email=${encodeURIComponent(email)}`;
		} else {
			window.location.href = config.redirectTo;
		}
	}

	async function handlePasskey() {
		setError(null);
		setLoading(true);

		const { error } = await authClient.passkey.register();

		if (error) {
			setError(error.message);
			setLoading(false);
			return;
		}

		window.location.href = config.redirectTo;
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
				<CardTitle className="text-2xl">Create your account</CardTitle>
				<CardDescription>Get started with {config.appName}</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{error && (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{config.features.emailPassword && (
					<form onSubmit={handleSubmit} className="grid gap-4">
						<div className="grid gap-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								type="text"
								name="name"
								placeholder="Enter your name"
								required
								autoComplete="name"
								disabled={loading}
							/>
						</div>
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
						<div className="grid gap-2">
							<Label htmlFor="password">Password</Label>
							<Input
								id="password"
								type="password"
								name="password"
								placeholder="Create a password"
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
								placeholder="Confirm your password"
								required
								autoComplete="new-password"
								disabled={loading}
							/>
						</div>
						<Button type="submit" className="w-full" disabled={loading}>
							{loading ? "Creating account..." : "Create Account"}
						</Button>
					</form>
				)}

				{config.features.passkey && (
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={handlePasskey}
						disabled={loading}
					>
						<svg
							className="size-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="10" r="3" />
							<path d="M12 2a8 8 0 0 0-8 8c0 1.892.402 3.13 1.5 4.5L12 22l6.5-7.5c1.098-1.37 1.5-2.608 1.5-4.5a8 8 0 0 0-8-8z" />
						</svg>
						Sign up with Passkey
					</Button>
				)}

				{showDivider && (
					<div className="relative">
						<div className="absolute inset-0 flex items-center">
							<Separator className="w-full" />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-card px-2 text-muted-foreground">or</span>
						</div>
					</div>
				)}

				{hasSocial && (
					<SocialButtons
						providers={config.socialProviders}
						apiBaseUrl={config.apiBaseUrl}
						layout="grid"
					/>
				)}
			</CardContent>
			<CardFooter className="justify-center text-sm text-muted-foreground">
				Already have an account?{" "}
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
