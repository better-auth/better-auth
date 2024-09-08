"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import type { Session, User } from "@/lib/types";
import { Check, Laptop, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import AddPasskey from "./add-passkey";
import { Button } from "./ui/button";
import { UAParser } from "ua-parser-js";

export default function UserCard(props: {
	session: {
		user: User;
		session: Session & {
			activeOrganizationId: string | undefined;
		};
	} | null;
}) {
	const router = useRouter();
	const session = authClient.useSession(props.session);
	const ua = new UAParser(session?.session.userAgent);

	return (
		<Card>
			<CardHeader>
				<CardTitle>User</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-8">
				<div className="flex items-center gap-4">
					<Avatar className="hidden h-9 w-9 sm:flex">
						<AvatarImage src={session?.user.image || "#"} alt="Avatar" />
						<AvatarFallback>{session?.user.name.charAt(0)}</AvatarFallback>
					</Avatar>
					<div className="grid gap-1">
						<p className="text-sm font-medium leading-none">
							{session?.user.name}
						</p>
						<p className="text-sm text-muted-foreground">
							{session?.user.email}
						</p>
					</div>
				</div>
				<div className="border border-border p-2 rounded-md gap-1 flex flex-col bg-gradient-to-br from-stone-950 to-stone-900/60">
					<p className="text-sm font-medium text-muted-foreground">
						Active Session
					</p>
					<div className="flex items-center gap-2 text-orange-300/80 text-sm">
						<Laptop size={18} />
						{ua.getOS().name}, {ua.getBrowser().name}
					</div>
				</div>
				<div className="border-y py-4 flex items-center justify-between gap-2">
					<AddPasskey />
					{session?.user.twoFactorEnabled ? (
						<Button
							variant="secondary"
							className="gap-2"
							onClick={async () => {
								const res = await authClient.twoFactor.disable();
								if (res.error) {
									toast.error(res.error.message);
								}
							}}
						>
							Disable 2FA
						</Button>
					) : (
						<Button
							variant="outline"
							className="gap-2"
							onClick={async () => {
								const res = await authClient.twoFactor.enable();
								if (res.error) {
									toast.error(res.error.message);
								}
							}}
						>
							<p>Enable 2FA</p>
						</Button>
					)}
				</div>
			</CardContent>
			<CardFooter>
				<Button className="gap-2 z-10" variant="secondary">
					<LogOut size={16} />
					<span
						className="text-sm"
						onClick={async () => {
							await authClient.signOut();
							router.refresh();
						}}
					>
						Sign Out
					</span>
				</Button>
			</CardFooter>
		</Card>
	);
}
