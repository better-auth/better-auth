"use client";

import { ChevronDown, PlusCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandGroup,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { getQueryClient } from "@/data/query-client";
import { userKeys } from "@/data/user/keys";
import type { SessionData } from "@/data/user/session-query";
import { useSessionQuery } from "@/data/user/session-query";
import type { DeviceSession } from "@/lib/auth";
import { authClient } from "@/lib/auth-client";

export default function AccountSwitcher({
	deviceSessions,
	initialSession,
}: {
	deviceSessions: DeviceSession[];
	initialSession: SessionData;
}) {
	const queryClient = getQueryClient();
	const { data: currentUser } = useSessionQuery(initialSession);
	const [open, setOpen] = useState(false);
	const router = useRouter();

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Select a user"
					className="w-[250px] justify-between"
				>
					<Avatar className="mr-2 h-6 w-6">
						<AvatarImage
							src={currentUser?.user.image || undefined}
							alt={currentUser?.user.name}
						/>
						<AvatarFallback>{currentUser?.user.name.charAt(0)}</AvatarFallback>
					</Avatar>
					{currentUser?.user.name}
					<ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-[250px] p-0">
				<Command>
					<CommandList>
						<CommandGroup heading="Current Account">
							<CommandItem
								onSelect={() => {}}
								className="text-sm w-full justify-between"
								key={currentUser?.user.id}
							>
								<div className="flex items-center">
									<Avatar className="mr-2 h-5 w-5">
										<AvatarImage
											src={currentUser?.user.image || undefined}
											alt={currentUser?.user.name}
										/>
										<AvatarFallback>
											{currentUser?.user.name.charAt(0)}
										</AvatarFallback>
									</Avatar>
									{currentUser?.user.name}
								</div>
							</CommandItem>
						</CommandGroup>
						<CommandSeparator />
						<CommandGroup heading="Switch Account">
							{deviceSessions
								.filter((s) => s.user.id !== currentUser?.user.id)
								.map((u, i) => (
									<CommandItem
										key={i}
										onSelect={async () => {
											try {
												await authClient.multiSession.setActive({
													sessionToken: u.session.token,
												});
												await queryClient.invalidateQueries({
													queryKey: userKeys.all(),
												});
												setOpen(false);
												router.refresh();
											} catch (error) {
												console.error("Failed to switch account:", error);
											}
										}}
										className="text-sm"
									>
										<Avatar className="mr-2 h-5 w-5">
											<AvatarImage
												src={u.user.image || undefined}
												alt={u.user.name}
											/>
											<AvatarFallback>{u.user.name.charAt(0)}</AvatarFallback>
										</Avatar>
										<div className="flex items-center justify-between w-full">
											<div>
												<p>{u.user.name}</p>
												<p className="text-xs">({u.user.email})</p>
											</div>
										</div>
									</CommandItem>
								))}
						</CommandGroup>
					</CommandList>
					<CommandSeparator />
					<CommandList>
						<CommandGroup>
							<CommandItem
								onSelect={() => {
									router.push("/sign-in");
									setOpen(false);
								}}
								className="cursor-pointer text-sm"
							>
								<PlusCircle className="mr-2 h-5 w-5" />
								Add Account
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
