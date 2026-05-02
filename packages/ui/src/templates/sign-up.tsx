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
} from "./components";

/**
 * Sign-up page template with ID-annotated elements for hydration.
 * All interactive elements have predictable IDs starting with "ba-signup-".
 */
export function SignUpTemplate() {
	return (
		<Card className="w-full min-w-96 mx-auto">
			<CardHeader className="text-center">
				<div
					id="ba-signup-logo"
					className="flex items-center justify-center gap-3 mb-2"
				>
					{/* Logo and app name injected at runtime */}
				</div>
				<CardTitle className="text-2xl">Create your account</CardTitle>
				<CardDescription id="ba-signup-description">
					Get started today
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<div id="ba-signup-error" className="hidden">
					<Alert variant="destructive">
						<AlertDescription id="ba-signup-error-msg" />
					</Alert>
				</div>

				<form id="ba-signup-form" className="grid gap-4">
					<div className="grid gap-2">
						<Label htmlFor="ba-signup-name">Name</Label>
						<Input
							id="ba-signup-name"
							type="text"
							name="name"
							placeholder="Enter your name"
							required
							autoComplete="name"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ba-signup-email">Email</Label>
						<Input
							id="ba-signup-email"
							type="email"
							name="email"
							placeholder="Enter your email address"
							required
							autoComplete="email"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ba-signup-password">Password</Label>
						<Input
							id="ba-signup-password"
							type="password"
							name="password"
							placeholder="Create a password"
							required
							autoComplete="new-password"
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="ba-signup-confirm">Confirm Password</Label>
						<Input
							id="ba-signup-confirm"
							type="password"
							name="confirmPassword"
							placeholder="Confirm your password"
							required
							autoComplete="new-password"
						/>
					</div>
					<Button
						id="ba-signup-submit"
						type="submit"
						className="w-full focus-visible:ring-0"
					>
						Create Account
					</Button>
				</form>

				<div id="ba-signup-passkey-wrapper">
					<Button
						id="ba-signup-passkey"
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
						Sign up with Passkey
					</Button>
				</div>

				<div id="ba-signup-divider" className="relative">
					<div className="absolute inset-0 flex items-center">
						<Separator className="w-full" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-card px-2 text-muted-foreground">or</span>
					</div>
				</div>

				<div id="ba-signup-social" className="grid grid-cols-2 gap-2">
					{/* Social buttons injected at runtime */}
				</div>
			</CardContent>
			<CardFooter
				id="ba-signup-footer"
				className="justify-center text-sm text-muted-foreground"
			>
				Already have an account?{" "}
				<a
					id="ba-signup-signin-link"
					href="#"
					className="text-primary hover:underline ml-1"
				>
					Sign in
				</a>
			</CardFooter>
		</Card>
	);
}
