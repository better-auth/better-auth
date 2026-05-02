import {
	Alert,
	AlertDescription,
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./components";

/**
 * Verify email page template with ID-annotated elements for hydration.
 * All interactive elements have predictable IDs starting with "ba-verify-".
 */
export function VerifyEmailTemplate() {
	return (
		<>
			{/* Loading state */}
			<div id="ba-verify-loading-view" className="hidden">
				<Card className="w-full min-w-96 mx-auto">
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
			</div>

			{/* Success state */}
			<div id="ba-verify-success-view" className="hidden">
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
						<CardTitle className="text-2xl">Email Verified!</CardTitle>
						<CardDescription>
							Your email has been successfully verified. You can now sign in.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button id="ba-verify-continue-btn" className="w-full">
							Continue
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Error state (with token) */}
			<div id="ba-verify-error-view" className="hidden">
				<Card className="w-full min-w-96 mx-auto">
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
						<CardDescription id="ba-verify-error-msg">
							This verification link is invalid or has expired.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2">
						<Button id="ba-verify-resend-btn" className="w-full hidden">
							Resend Verification Email
						</Button>
						<Button
							id="ba-verify-back-btn"
							className="w-full"
							variant="outline"
						>
							Back to Sign In
						</Button>
					</CardContent>
				</Card>
			</div>

			{/* Pending state (no token, waiting for user to check email) */}
			<div id="ba-verify-pending-view">
				<Card className="w-full min-w-96 mx-auto">
					<CardHeader className="text-center">
						<div
							id="ba-verify-logo"
							className="flex items-center justify-center gap-3 mb-2"
						>
							{/* Logo and app name injected at runtime */}
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
						<CardDescription id="ba-verify-pending-desc">
							We've sent a verification link to your email. Click the link to
							verify your account.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2">
						<div id="ba-verify-pending-error" className="hidden mb-2">
							<Alert variant="destructive">
								<AlertDescription id="ba-verify-pending-error-msg" />
							</Alert>
						</div>
						<Button
							id="ba-verify-pending-resend-btn"
							className="w-full hidden"
							variant="outline"
						>
							Resend Verification Email
						</Button>
						<Button
							id="ba-verify-pending-back-btn"
							className="w-full"
							variant="ghost"
						>
							Back to Sign In
						</Button>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
