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
} from "./components";

/**
 * Reset password page template with ID-annotated elements for hydration.
 * All interactive elements have predictable IDs starting with "ba-reset-".
 */
export function ResetPasswordTemplate() {
	return (
		<>
			{/* Invalid token state */}
			<div id="ba-reset-invalid-view" className="hidden">
				<Card className="w-full min-w-96 mx-auto">
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">Invalid Reset Link</CardTitle>
						<CardDescription>
							This password reset link is invalid or has expired.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button id="ba-reset-request-btn" className="w-full">
							Request New Reset Link
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Form state */}
			<div id="ba-reset-form-view">
				<Card className="w-full min-w-96 mx-auto">
					<CardHeader className="text-center">
						<div
							id="ba-reset-logo"
							className="flex items-center justify-center gap-3 mb-2"
						>
							{/* Logo and app name injected at runtime */}
						</div>
						<CardTitle className="text-2xl">Reset your password</CardTitle>
						<CardDescription>Enter your new password below.</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4">
						<div id="ba-reset-error" className="hidden">
							<Alert variant="destructive">
								<AlertDescription id="ba-reset-error-msg" />
							</Alert>
						</div>

						<form id="ba-reset-form" className="grid gap-4">
							<div className="grid gap-2">
								<Label htmlFor="ba-reset-password">New Password</Label>
								<Input
									id="ba-reset-password"
									type="password"
									name="password"
									placeholder="Enter new password"
									required
									autoComplete="new-password"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="ba-reset-confirm">Confirm Password</Label>
								<Input
									id="ba-reset-confirm"
									type="password"
									name="confirmPassword"
									placeholder="Confirm new password"
									required
									autoComplete="new-password"
								/>
							</div>
							<Button id="ba-reset-submit" type="submit" className="w-full">
								Reset Password
							</Button>
						</form>
					</CardContent>
				</Card>
			</div>

			{/* Success state */}
			<div id="ba-reset-success-view" className="hidden">
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
						<Button id="ba-reset-signin-btn" className="w-full">
							Sign In
						</Button>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
