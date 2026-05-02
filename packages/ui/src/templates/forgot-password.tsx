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
} from "./components";

/**
 * Forgot password page template with ID-annotated elements for hydration.
 * All interactive elements have predictable IDs starting with "ba-forgot-".
 */
export function ForgotPasswordTemplate() {
	return (
		<>
			{/* Initial state - request form */}
			<div id="ba-forgot-form-view">
				<Card className="w-full min-w-96 mx-auto">
					<CardHeader className="text-center">
						<div
							id="ba-forgot-logo"
							className="flex items-center justify-center gap-3 mb-2"
						>
							{/* Logo and app name injected at runtime */}
						</div>
						<CardTitle className="text-2xl">Forgot your password?</CardTitle>
						<CardDescription>
							Enter your email and we'll send you a reset link.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div id="ba-forgot-error" className="hidden">
							<Alert variant="destructive">
								<AlertDescription id="ba-forgot-error-msg" />
							</Alert>
						</div>

						<form id="ba-forgot-form" className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="ba-forgot-email">Email</Label>
								<Input
									id="ba-forgot-email"
									type="email"
									name="email"
									placeholder="Enter your email address"
									required
									autoComplete="email"
								/>
							</div>
							<Button id="ba-forgot-submit" type="submit" className="w-full">
								Send Reset Link
							</Button>
						</form>
					</CardContent>
					<CardFooter
						id="ba-forgot-footer"
						className="justify-center text-sm text-muted-foreground"
					>
						Remember your password?{" "}
						<a
							id="ba-forgot-signin-link"
							href="#"
							className="text-primary hover:underline ml-1"
						>
							Sign in
						</a>
					</CardFooter>
				</Card>
			</div>

			{/* Success state - email sent */}
			<div id="ba-forgot-success-view" className="hidden">
				<Card className="w-full min-w-96 mx-auto">
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
							id="ba-forgot-back-btn"
							className="w-full"
							variant="outline"
						>
							Back to Sign In
						</Button>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
