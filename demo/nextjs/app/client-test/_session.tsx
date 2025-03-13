"use client";

import { client } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardFooter,
} from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function SessionDisplay() {
	const { data: session, isPending, error } = client.useSession();
	return (
		<Card>
			<CardHeader>
				<CardTitle>Session Information</CardTitle>
				<CardDescription>
					{isPending
						? "Loading session..."
						: session
							? "You are currently logged in"
							: "You are not logged in"}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<div className="flex justify-center py-4">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : error ? (
					<div className="p-4 bg-destructive/10 text-destructive rounded-md">
						Error: {error.message}
					</div>
				) : session ? (
					<div className="space-y-4">
						<div className="flex items-center gap-4">
							{session.user.image ? (
								<img
									src={session.user.image}
									alt="Profile"
									className="h-12 w-12 rounded-full object-cover"
								/>
							) : (
								<div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
									<span className="text-lg font-medium">
										{session.user.name?.charAt(0) ||
											session.user.email?.charAt(0)}
									</span>
								</div>
							)}
							<div>
								<p className="font-medium">{session.user.name}</p>
								<p className="text-sm text-muted-foreground">
									{session.user.email}
								</p>
							</div>
						</div>

						<div className="rounded-md bg-muted p-4">
							<p className="text-sm font-medium mb-2">Session Details:</p>
							<pre className="text-xs overflow-auto max-h-40">
								{JSON.stringify(session, null, 2)}
							</pre>
						</div>
					</div>
				) : (
					<div className="py-8 text-center text-muted-foreground">
						<p>Sign in to view your session information</p>
					</div>
				)}
			</CardContent>
			{session && (
				<CardFooter>
					<Button
						variant="outline"
						className="w-full"
						onClick={() =>
							client.signOut({
								fetchOptions: {
									onSuccess: () => {
										toast.success("Successfully signed out!");
									},
								},
							})
						}
					>
						Sign Out
					</Button>
				</CardFooter>
			)}
		</Card>
	);
}

export function UserAvatar() {
	const { data: session, isPending } = client.useSession();
	if (!session && !isPending) {
		return null;
	}
	return (
		<div className="flex items-center gap-4">
			<Avatar
				className={cn("hidden h-7 w-7 sm:flex", isPending && "animate-pulse")}
			>
				<AvatarImage
					src={session?.user.image || undefined}
					alt="Avatar"
					className="object-cover"
				/>
				<AvatarFallback>{session?.user.name.charAt(0)}</AvatarFallback>
			</Avatar>
		</div>
	);
}
