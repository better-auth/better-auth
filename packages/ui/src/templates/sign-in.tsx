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
	Checkbox,
	Input,
	Label,
	Separator,
} from "./components";

/**
 * Sign-in page template with ID-annotated elements for hydration.
 * All interactive elements have predictable IDs starting with "ba-signin-".
 */
export function SignInTemplate() {
	return (
		<Card className="w-full min-w-96 mx-auto">
			<CardHeader className="text-center">
				<div
					id="ba-signin-logo"
					className="flex items-center justify-center gap-3 mb-2"
				>
					{/* Logo and app name injected at runtime */}
				</div>
				<CardTitle className="text-2xl">Sign in to your account</CardTitle>
				<CardDescription>
					Welcome back! Please sign in to continue.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div id="ba-signin-error" className="hidden">
					<Alert variant="destructive">
						<AlertDescription id="ba-signin-error-msg" />
					</Alert>
				</div>

				<form id="ba-signin-form" className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="ba-signin-email">Email</Label>
						<Input
							id="ba-signin-email"
							type="email"
							name="email"
							placeholder="Enter your email address"
							required
							autoComplete="email"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ba-signin-password">Password</Label>
						<Input
							id="ba-signin-password"
							type="password"
							name="password"
							placeholder="Enter your password"
							required
							autoComplete="current-password"
						/>
						<div className="flex justify-end">
							<a
								id="ba-signin-forgot-link"
								href="#"
								className="text-sm text-muted-foreground hover:text-primary transition-colors"
							>
								Forgot password?
							</a>
						</div>
					</div>
					<div
						id="ba-signin-remember-wrapper"
						className="flex items-center space-x-2"
					>
						<Checkbox id="ba-signin-remember" name="rememberMe" />
						<Label htmlFor="ba-signin-remember" className="text-sm font-normal">
							Remember me
						</Label>
					</div>
					<Button id="ba-signin-submit" type="submit" className="w-full">
						Continue
					</Button>
				</form>

				<div id="ba-signin-passkey-wrapper">
					<Button
						id="ba-signin-passkey"
						type="button"
						variant="outline"
						className="w-full"
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
						Sign in with Passkey
					</Button>
				</div>

				<div id="ba-signin-divider" className="relative">
					<div className="absolute inset-0 flex items-center">
						<Separator className="w-full" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-card px-2 text-muted-foreground">or</span>
					</div>
				</div>

				<div id="ba-signin-social" className="grid grid-cols-2 gap-2">
					{/* Social buttons injected at runtime */}
				</div>
			</CardContent>
			<CardFooter
				id="ba-signin-footer"
				className="justify-center text-sm text-muted-foreground"
			>
				Don't have an account?{" "}
				<a
					id="ba-signin-signup-link"
					href="#"
					className="text-primary hover:underline ml-1"
				>
					Sign up
				</a>
			</CardFooter>
		</Card>
	);
}
