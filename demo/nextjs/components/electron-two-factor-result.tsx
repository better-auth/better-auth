"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function useTwoFactorCompletion() {
	const router = useRouter();
	const params = useSearchParams();
	const [result, setResult] = useState<{ code: string | null } | null>(null);
	const request = params.toString();
	useEffect(() => {
		setResult(null);
	}, [request]);
	const onSuccess = () => {
		if (params.get("client_id") !== "electron") {
			router.push("/dashboard");
			return;
		}
		const code = authClient.electron.getAuthorizationCode();
		setResult({ code });
		if (code) authClient.ensureElectronRedirect();
	};
	return { result, onSuccess, request };
}

export function ElectronTwoFactorResult({ code }: { code: string | null }) {
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState<string | null>(null);
	return (
		<div className="grid gap-3" role="status">
			<p>Browser verification succeeded.</p>
			{code ? (
				<>
					<p>
						Return to the desktop app. If it did not open, copy this code into
						the app.
					</p>
					<Button
						onClick={async () => {
							setError(null);
							try {
								await navigator.clipboard.writeText(code);
								setCopied(true);
							} catch {
								setError("Could not copy the code. Select and copy it below.");
							}
						}}
					>
						{copied ? "Copied" : "Copy desktop sign-in code"}
					</Button>
					<code className="break-all select-all">{code}</code>
					<p>
						If this code has expired, start sign-in again from the desktop app.
					</p>
				</>
			) : (
				<p>
					The desktop request expired or is unavailable. Start sign-in again
					from the desktop app.
				</p>
			)}
			{error && <p role="alert">{error}</p>}
		</div>
	);
}
