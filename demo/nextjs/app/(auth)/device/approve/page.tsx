"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSessionQuery } from "@/data/user/session-query";
import { authClient } from "@/lib/auth-client";
import { deviceClients } from "@/lib/device-clients";

const LOOKUP_UNAVAILABLE =
	"Could not load this request. Try again in a moment.";

export default function Page() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const userCode = searchParams.get("user_code");
	const { data: session } = useSessionQuery();
	const [isApprovePending, startApproveTransition] = useTransition();
	const [isDenyPending, startDenyTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [lookupFailure, setLookupFailure] = useState<
		"rejected" | "unreachable" | null
	>(null);
	const [lookupAttempt, setLookupAttempt] = useState(0);
	const [lookup, setLookup] = useState<{
		userCode: string;
		client_id: string;
		scope?: string;
	} | null>(null);
	// Details from a previous code must not label or enable this one.
	const request = lookup?.userCode === userCode ? lookup : null;

	useEffect(() => {
		setLookup(null);
		setError(null);
		setLookupFailure(null);
		if (!session || !userCode) return;
		let active = true;
		authClient
			.device({ query: { user_code: userCode } })
			.then(({ data, error }) => {
				if (!active) return;
				// Server errors and rate limits are worth retrying; a rejected code is not.
				if (
					error &&
					(!error.status || error.status === 429 || error.status >= 500)
				) {
					setLookupFailure("unreachable");
					setError(LOOKUP_UNAVAILABLE);
					return;
				}
				if (!data?.client_id || data.status !== "pending") {
					setLookupFailure("rejected");
					setError(
						error?.error_description ||
							"This code is invalid, expired, already used, or was claimed by another session.",
					);
					return;
				}
				setLookup({ userCode, client_id: data.client_id, scope: data.scope });
			})
			.catch(() => {
				if (!active) return;
				setLookupFailure("unreachable");
				setError(LOOKUP_UNAVAILABLE);
			});
		return () => {
			active = false;
		};
	}, [session, userCode, lookupAttempt]);

	const loadingText = lookupFailure ? "Unavailable" : "Loading...";

	const handleApprove = () => {
		if (!userCode) return;

		setError(null);

		startApproveTransition(async () => {
			try {
				await authClient.device.approve({
					userCode,
				});
				router.push("/device/success");
			} catch (err: any) {
				setError(err.error?.message || "Failed to approve device");
			}
		});
	};

	const handleDeny = () => {
		if (!userCode) return;

		setError(null);

		startDenyTransition(async () => {
			try {
				await authClient.device.deny({
					userCode,
				});
				router.push("/device/denied");
			} catch (err: any) {
				setError(err.error?.message || "Failed to deny device");
			}
		});
	};

	if (!session) {
		return null;
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md p-6">
				<div className="space-y-4">
					<div className="text-center">
						<h1 className="text-2xl font-bold">Approve Device</h1>
						<p className="text-muted-foreground mt-2">
							A device is requesting access to your account
						</p>
					</div>

					<div className="space-y-4">
						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Device Code</p>
							<p className="font-mono text-lg">{userCode}</p>
						</div>

						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Requesting client</p>
							{request ? (
								<>
									<p>
										{deviceClients.get(request.client_id) ??
											"Unrecognized client"}
									</p>
									<p className="font-mono text-xs text-muted-foreground">
										ID sent by the device: {request.client_id}
									</p>
								</>
							) : (
								<p>{loadingText}</p>
							)}
						</div>

						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Requested scopes</p>
							<p>{request ? request.scope || "None" : loadingText}</p>
						</div>

						<p className="text-sm text-muted-foreground">
							Approve only if this code is showing right now on a device you
							have.
						</p>

						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Signed in as</p>
							<p>{session.user.email}</p>
						</div>

						{error && (
							<Alert variant="destructive">
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}

						{lookupFailure === "unreachable" && (
							<Button
								variant="outline"
								className="w-full"
								onClick={() => setLookupAttempt((attempt) => attempt + 1)}
							>
								Try again
							</Button>
						)}

						<div className="flex gap-3">
							<Button
								onClick={handleDeny}
								variant="outline"
								className="flex-1"
								disabled={isDenyPending}
							>
								{isDenyPending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<>
										<X className="mr-2 h-4 w-4" />
										Deny
									</>
								)}
							</Button>
							<Button
								onClick={handleApprove}
								className="flex-1"
								disabled={isApprovePending || !request}
							>
								{isApprovePending ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<>
										<Check className="mr-2 h-4 w-4" />
										Approve
									</>
								)}
							</Button>
						</div>
					</div>
				</div>
			</Card>
		</div>
	);
}
