"use client";

import { CheckIcon, CopyIcon, Loader2, LogInIcon, XIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export function ElectronManualSignInToast({
	t,
	authorizationCode,
}: {
	t: string | number;
	authorizationCode: string;
}) {
	const [copied, setCopied] = useState(false);
	return (
		<div className="flex items-start gap-2 border bg-background p-4 rounded-lg">
			<div className="flex flex-col gap-2 text-xs">
				<p className="font-semibold">Having trouble being redirected?</p>
				<p className="text-muted-foreground">
					Copy and paste the code into the app to continue.
				</p>
				<button
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(authorizationCode);
						} catch {
							toast.error(
								"Could not copy the code. Select and copy it manually.",
							);
							return;
						}
						setCopied(true);
						setTimeout(() => setCopied(false), 2000);
					}}
					className="inline-flex items-center gap-2 text-muted-foreground pointer-events-auto! hover:text-foreground focus-visible:text-foreground transition-colors"
				>
					{authorizationCode}
					{copied ? (
						<CheckIcon className="size-3.5" />
					) : (
						<CopyIcon className="size-3.5" />
					)}
				</button>
			</div>
			<button onClick={() => toast.dismiss(t)}>
				<XIcon className="size-3.5" />
			</button>
		</div>
	);
}

type TransferSession = {
	user: Pick<
		typeof authClient.$Infer.Session.user,
		"id" | "name" | "email" | "image"
	>;
	session: Pick<typeof authClient.$Infer.Session.session, "token">;
};

export function ElectronTransferUser({
	session: activeSession,
}: {
	session: typeof authClient.$Infer.Session;
}) {
	const params = useSearchParams();
	const request = params.toString();
	const generation = useRef(0);
	const [isLoading, startTransition] = useTransition();
	const [users, setUsers] = useState<TransferSession[]>([activeSession]);
	const [authorizationCode, setAuthorizationCode] = useState<string | null>(
		null,
	);
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		generation.current += 1;
		setAuthorizationCode(null);
		setCopied(false);
		return () => {
			generation.current += 1;
		};
	}, [request]);

	useEffect(() => {
		let active = true;
		setUsers([activeSession]);
		startTransition(async () => {
			try {
				const { data, error } =
					await authClient.multiSession.listDeviceSessions();
				if (!active) return;
				if (error) {
					toast.error(
						error.message ??
							"Could not load other accounts. Continue with the active account or retry.",
					);
					return;
				}
				const seen = new Set([activeSession.user.id]);
				const otherUsers = (data ?? []).filter((session) => {
					if (seen.has(session.user.id)) return false;
					seen.add(session.user.id);
					return true;
				});
				setUsers([activeSession, ...otherUsers]);
			} catch {
				if (active)
					toast.error(
						"Could not load other accounts. Continue with the active account or retry.",
					);
			}
		});
		return () => {
			active = false;
		};
	}, [activeSession]);

	const handleContinueAsUser = useCallback(
		(session: TransferSession) => () =>
			startTransition(async () => {
				const currentGeneration = generation.current;
				setAuthorizationCode(null);
				setCopied(false);
				let switched = false;
				try {
					if (session.user.id !== activeSession.user.id) {
						const { data, error } = await authClient.multiSession.setActive({
							sessionToken: session.session.token,
						});
						if (error || !data?.session) {
							toast.error(
								error?.message ?? "Could not switch to the selected account.",
							);
							return;
						}
						switched = true;
					}
					if (generation.current !== currentGeneration) return;
					const { data, error } = await authClient.electron.transferUser({
						fetchOptions: {
							query: Object.fromEntries(new URLSearchParams(request).entries()),
						},
					});
					if (generation.current !== currentGeneration) return;
					if (error || !data?.electron_authorization_code) {
						toast.error(
							error?.message ??
								"Could not transfer this session. Sign in again from the desktop app.",
						);
						return;
					}
					const code = authClient.electron.getAuthorizationCode();
					if (!code) {
						toast.error(
							"The desktop code is unavailable. Start sign-in again from the app.",
						);
						return;
					}
					setAuthorizationCode(code);
					authClient.ensureElectronRedirect();
				} catch {
					toast.error("Could not transfer the session. Try again.");
				} finally {
					if (switched) {
						try {
							const { error } = await authClient.multiSession.setActive({
								sessionToken: activeSession.session.token,
							});
							if (error)
								toast.error(
									"The browser could not restore its original account. Check the active account before continuing.",
								);
						} catch {
							toast.error(
								"The browser could not restore its original account. Check the active account before continuing.",
							);
						}
					}
				}
			}),
		[request, activeSession],
	);

	return (
		<div className="space-y-2 max-w-sm min-w-3xs">
			<p className="text-sm font-medium">Continue as:</p>
			<Separator />
			{users.map((session) => (
				<ContinueAsUser
					key={session.user.id}
					session={session}
					isLoading={isLoading}
					onContinue={handleContinueAsUser(session)}
				/>
			))}

			{authorizationCode && (
				<p className="text-xs text-muted-foreground leading-relaxed">
					<span className="font-medium">Having trouble being redirected?</span>{" "}
					Paste the code into the app:{" "}
					<button
						onClick={async () => {
							try {
								await navigator.clipboard.writeText(authorizationCode);
							} catch {
								toast.error(
									"Could not copy the code. Select and copy it manually.",
								);
								return;
							}
							setCopied(true);
							setTimeout(() => setCopied(false), 2000);
						}}
						className="inline-flex items-center gap-2 hover:text-foreground focus-visible:text-foreground transition-colors"
					>
						{authorizationCode}
						{copied ? (
							<CheckIcon className="size-3.5" />
						) : (
							<CopyIcon className="size-3.5" />
						)}
					</button>
				</p>
			)}
		</div>
	);
}

function ContinueAsUser({
	session,
	isLoading,
	onContinue,
}: {
	session: TransferSession;
	isLoading: boolean;
	onContinue: () => void;
}) {
	return (
		<button
			type="button"
			className="group flex w-full items-center gap-2.5 bg-background p-2.5 border border-border rounded-md drop-shadow-md hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors text-left disabled:pointer-events-none"
			aria-label={`Continue as ${session.user.name}`}
			disabled={isLoading}
			onClick={onContinue}
		>
			<Avatar className="size-9 shrink-0">
				<AvatarImage
					src={session.user.image ?? undefined}
					alt={session.user.name}
				/>
				<AvatarFallback>
					{session.user.name
						.normalize("NFD")
						.split(" ", 2)
						.map((n) => n.charAt(0))
						.join("")
						.toUpperCase()}
				</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1 truncate max-w-46 overflow-hidden">
				<p className="truncate text-sm font-medium">{session.user.name}</p>
				<p className="truncate text-xs text-muted-foreground">
					{session.user.email}
				</p>
			</div>
			<div
				className={buttonVariants({
					variant: "outline",
					size: "icon",
					className:
						"ms-auto size-8! group-hover:bg-accent group-hover:text-accent-foreground",
				})}
			>
				{isLoading ? (
					<Loader2 className="size-3.5 animate-spin" />
				) : (
					<LogInIcon className="size-3.5" />
				)}
			</div>
		</button>
	);
}
