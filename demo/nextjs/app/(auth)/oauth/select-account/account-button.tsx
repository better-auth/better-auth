"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import type { Session } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";

export function SelectAccountBtn({ session }: { session: Partial<Session> }) {
	return (
		<Button
			className="w-full gap-2 h-12"
			variant="outline"
			onClick={async () => {
				try {
					if (!session.session?.token) {
						toast.error("No session");
						return;
					}
					const { data: active, error: activeError } =
						await authClient.multiSession.setActive({
							sessionToken: session.session.token,
						});
					if (activeError || !active?.session) {
						toast.error(activeError?.message ?? "Failed to set active session");
						return;
					}
					const { data, error } = await authClient.oauth2.continue({
						selected: true,
					});
					if (error || !active?.session || !data.redirect || !data?.uri) {
						toast.error(error?.message ?? "Failed to continue");
						return;
					}
					window.location.href = data.uri;
				} catch (error) {
					toast.error(String(error));
				}
			}}
		>
			<Avatar className="mr-2 h-5 w-5">
				<AvatarImage
					src={session.user?.image || undefined}
					alt={session.user?.name}
				/>
				<AvatarFallback>{session.user?.name?.charAt(0)}</AvatarFallback>
			</Avatar>
			<div className="flex text-start w-full">
				<div>
					<p>{session.user?.name}</p>
					<p className="text-xs">{session.user?.email}</p>
				</div>
			</div>
		</Button>
	);
}

export function AnotherAccountBtn() {
	const params = useSearchParams();
	return (
		<Link href={`/sign-in${params ? `?${params.toString()}` : ""}`}>
			<Button className="w-full gap-2 h-12" variant="outline">
				Another Account
			</Button>
		</Link>
	);
}
