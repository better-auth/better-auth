"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSessionQuery } from "@/data/user/session-query";

export default function CibaApprovePage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const authReqId = searchParams.get("auth_req_id");
	const { data: session, isLoading: isSessionLoading } = useSessionQuery();
	const [isApprovePending, startApproveTransition] = useTransition();
	const [isDenyPending, startDenyTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [requestInfo, setRequestInfo] = useState<{
		clientId: string;
		scope: string;
		bindingMessage?: string;
		status: string;
	} | null>(null);
	const [isLoadingRequest, setIsLoadingRequest] = useState(true);

	// Fetch request info on mount
	useEffect(() => {
		if (!authReqId) {
			setIsLoadingRequest(false);
			return;
		}

		fetch(`/api/auth/ciba/verify?auth_req_id=${authReqId}`)
			.then((res) => res.json())
			.then((data) => {
				if (data.error) {
					setError(data.error_description || data.error);
				} else {
					setRequestInfo({
						clientId: data.client_id,
						scope: data.scope,
						bindingMessage: data.binding_message,
						status: data.status,
					});
				}
			})
			.catch(() => setError("Failed to load request details"))
			.finally(() => setIsLoadingRequest(false));
	}, [authReqId]);

	const handleApprove = () => {
		if (!authReqId) return;

		setError(null);

		startApproveTransition(async () => {
			try {
				const res = await fetch("/api/auth/ciba/authorize", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ auth_req_id: authReqId }),
				});
				const data = await res.json();
				if (!res.ok) {
					setError(data.error_description || data.message || "Failed to approve");
				} else {
					router.push("/dashboard?ciba=approved");
				}
			} catch (err: any) {
				setError(err.message || "Failed to approve request");
			}
		});
	};

	const handleDeny = () => {
		if (!authReqId) return;

		setError(null);

		startDenyTransition(async () => {
			try {
				const res = await fetch("/api/auth/ciba/reject", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ auth_req_id: authReqId }),
				});
				const data = await res.json();
				if (!res.ok) {
					setError(data.error_description || data.message || "Failed to deny");
				} else {
					router.push("/dashboard?ciba=denied");
				}
			} catch (err: any) {
				setError(err.message || "Failed to deny request");
			}
		});
	};

	// Show loading while checking session
	if (isSessionLoading || isLoadingRequest) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-md p-6">
					<div className="flex items-center justify-center">
						<Loader2 className="h-6 w-6 animate-spin" />
						<span className="ml-2">Loading...</span>
					</div>
				</Card>
			</div>
		);
	}

	if (!session) {
		// Redirect to sign in with return URL
		router.push(`/sign-in?callbackUrl=${encodeURIComponent(`/ciba/approve?auth_req_id=${authReqId}`)}`);
		return null;
	}

	// Show expired/not found message if request doesn't exist, had an error, or was already processed
	if (error || !requestInfo || requestInfo.status !== "pending") {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-md p-6">
					<div className="text-center space-y-4">
						<X className="h-12 w-12 text-muted-foreground mx-auto" />
						<h1 className="text-2xl font-bold">Request Expired</h1>
						<p className="text-muted-foreground">
							This authentication request has expired or has already been processed.
						</p>
						<Button onClick={() => router.push("/dashboard")}>Go to Dashboard</Button>
					</div>
				</Card>
			</div>
		);
	}

	if (!authReqId) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-md p-6">
					<p className="text-center text-red-500">Missing auth_req_id parameter</p>
				</Card>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-md p-6">
				<div className="space-y-4">
					<div className="text-center">
						<h1 className="text-2xl font-bold">Approve Access Request</h1>
						<p className="text-muted-foreground mt-2">
							An application is requesting access to your account
						</p>
					</div>

					<div className="space-y-4">
						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Application</p>
							<p className="font-mono">{requestInfo.clientId}</p>
						</div>

						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Requested Scopes</p>
							<p>{requestInfo.scope}</p>
						</div>

						{requestInfo.bindingMessage && (
							<div className="rounded-lg bg-muted p-4">
								<p className="text-sm font-medium">Message</p>
								<p>{requestInfo.bindingMessage}</p>
							</div>
						)}

						<div className="rounded-lg bg-muted p-4">
							<p className="text-sm font-medium">Signed in as</p>
							<p>{session.user.email}</p>
						</div>

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
								disabled={isApprovePending}
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
