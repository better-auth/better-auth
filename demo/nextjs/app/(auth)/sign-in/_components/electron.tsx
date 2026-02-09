"use client";

import { Loader2, LogInIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

export function ElectronTransferUser({
	session: activeSession,
}: {
	session: typeof authClient.$Infer.Session;
}) {
	const params = Object.fromEntries(useSearchParams().entries());
	const [isLoading, startTransition] = useTransition();
	const [users, setUsers] = useState<(typeof authClient.$Infer.Session)[]>([
		activeSession,
	]);

	useEffect(() => {
		startTransition(async () => {
			const { data } = await authClient.multiSession.listDeviceSessions();

			if (data?.length) {
				setUsers((prev) => {
					// Filter out unique users from device session
					const seenUserIds = new Set(prev.map((s) => s.user.id));
					const users = data.filter((session) => {
						if (
							session.user.id === activeSession.user.id || // Skip active user
							seenUserIds.has(session.user.id)
						)
							return false;
						seenUserIds.add(session.user.id);
						return true;
					}) as (typeof authClient.$Infer.Session)[];
					return [...prev, ...users];
				});
			}
		});
	}, []);

	const handleContinueAsUser = useCallback(
		(session: typeof authClient.$Infer.Session) => () =>
			startTransition(async () => {
				if (session.user.id === activeSession.user.id) {
					// Continue as current user
					await authClient.electron.transferUser({
						fetchOptions: {
							query: params,
						},
					});
					return;
				}

				// Switch to the selected user
				const originalSessionToken = activeSession.session.token;
				await authClient.multiSession.setActive({
					sessionToken: session.session.token,
				});

				const promise = authClient.electron.transferUser({
					fetchOptions: {
						query: params,
					},
				});

				// Switch back to the original session
				await authClient.multiSession.setActive({
					sessionToken: originalSessionToken,
				});

				// Transfer user
				await promise;
			}),
		[params, activeSession],
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
		</div>
	);
}

function ContinueAsUser({
	session,
	isLoading,
	onContinue,
}: {
	session: typeof authClient.$Infer.Session;
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
