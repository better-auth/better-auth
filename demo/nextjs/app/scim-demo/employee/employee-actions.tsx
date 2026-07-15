"use client";

import { Loader2, LogIn, LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

interface EmployeeSignInProps {
	buttonLabel?: string;
	callbackURL: string;
	email: string;
	loginHint: string;
}

export function EmployeeSignIn({
	buttonLabel = "Continue with Acme SSO",
	callbackURL,
	email,
	loginHint,
}: EmployeeSignInProps) {
	const [isRedirecting, setIsRedirecting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signIn = async () => {
		if (isRedirecting) return;
		setIsRedirecting(true);
		setError(null);
		try {
			const result = await authClient.signIn.sso({
				providerId: "scim-demo-sso",
				callbackURL,
				errorCallbackURL: callbackURL,
				email,
				loginHint,
			});
			if (result.error) {
				setError("We couldn’t start Acme SSO. Try again.");
				setIsRedirecting(false);
			}
		} catch {
			setError("We couldn’t start Acme SSO. Try again.");
			setIsRedirecting(false);
		}
	};

	return (
		<div className="space-y-3">
			<Button
				type="button"
				className="min-h-11 w-full gap-2"
				disabled={isRedirecting}
				onClick={() => void signIn()}
			>
				{isRedirecting ? (
					<Loader2
						className="size-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
				) : (
					<LogIn className="size-4" aria-hidden="true" />
				)}
				{isRedirecting ? "Redirecting to Acme…" : buttonLabel}
			</Button>
			<p className="min-h-5 text-sm text-destructive" aria-live="polite">
				{error}
			</p>
		</div>
	);
}

interface EmployeeSignOutProps {
	buttonLabel?: string;
	returnURL: string;
}

export function EmployeeSignOut({
	buttonLabel = "Sign out",
	returnURL,
}: EmployeeSignOutProps) {
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signOut = async () => {
		if (isSigningOut) return;
		setIsSigningOut(true);
		setError(null);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				setError("We couldn’t sign you out. Try again.");
				setIsSigningOut(false);
				return;
			}
			window.location.assign(returnURL);
		} catch {
			setError("We couldn’t sign you out. Try again.");
			setIsSigningOut(false);
		}
	};

	return (
		<div className="space-y-3">
			<Button
				type="button"
				variant="outline"
				className="min-h-11 w-full gap-2"
				disabled={isSigningOut}
				onClick={() => void signOut()}
			>
				{isSigningOut ? (
					<Loader2
						className="size-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/>
				) : (
					<LogOut className="size-4" aria-hidden="true" />
				)}
				{isSigningOut ? "Signing out…" : buttonLabel}
			</Button>
			<p className="min-h-5 text-sm text-destructive" aria-live="polite">
				{error}
			</p>
		</div>
	);
}
