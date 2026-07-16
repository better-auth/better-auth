import { Filter, Search } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { SCIM_DEMO_GROUP_LABELS } from "@/lib/scim-demo-catalog";
import type {
	SCIMDemoUserKey,
	SCIMDemoUserState,
} from "@/lib/scim-demo-contract";
import { cn } from "@/lib/utils";
import {
	formatRelativeTime,
	getAccessLabel,
	getLifecycleLabel,
	StatusMark,
	UserStatusBadge,
} from "./resource-presentation";

export type UserFilter = "all" | "provisioned" | "not-provisioned";

interface UserListProps {
	filter: UserFilter;
	filteredUsers: SCIMDemoUserState[];
	isSelectionDisabled: boolean;
	onFilterChange: (filter: UserFilter) => void;
	onSearchChange: (search: string) => void;
	onSelectUser: (userKey: SCIMDemoUserKey) => void;
	search: string;
	selectedUserKey: SCIMDemoUserKey;
	totalUserCount: number;
}

export function UserList({
	filter,
	filteredUsers,
	isSelectionDisabled,
	onFilterChange,
	onSearchChange,
	onSelectUser,
	search,
	selectedUserKey,
	totalUserCount,
}: UserListProps) {
	const normalizedSearch = search.trim();
	const emptyMessage = normalizedSearch
		? filter === "all"
			? `No users match “${normalizedSearch}”`
			: `No users match “${normalizedSearch}” with this filter`
		: "No users match this filter";

	return (
		<section
			className="min-w-0 border-b xl:border-r xl:border-b-0"
			aria-labelledby="users-heading"
		>
			<h2 id="users-heading" className="sr-only">
				Directory users
			</h2>
			<div className="flex flex-col gap-3 border-b p-4 sm:flex-row">
				<label className="relative min-w-0 flex-1">
					<span className="sr-only">Search directory users</span>
					<Search
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
						aria-hidden="true"
					/>
					<Input
						type="search"
						name="scim-user-search"
						autoComplete="off"
						value={search}
						onChange={(event) => onSearchChange(event.target.value)}
						placeholder="Search users…"
						className="pl-9"
					/>
				</label>
				<label className="relative">
					<span className="sr-only">Filter users</span>
					<Filter
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<select
						name="scim-user-filter"
						autoComplete="off"
						value={filter}
						onChange={(event) =>
							onFilterChange(event.target.value as UserFilter)
						}
						className="h-9 min-w-36 appearance-none border bg-background pr-8 pl-9 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="all">All users</option>
						<option value="provisioned">Provisioned</option>
						<option value="not-provisioned">Not provisioned</option>
					</select>
				</label>
			</div>

			{filteredUsers.length > 0 ? (
				<>
					<div className="hidden md:block">
						<Table>
							<caption className="sr-only">
								Directory users and provisioning state
							</caption>
							<TableHeader>
								<TableRow>
									<TableHead>User</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Groups</TableHead>
									<TableHead>Access</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Last operation</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filteredUsers.map((user) => (
									<TableRow
										key={user.key}
										data-state={
											selectedUserKey === user.key ? "selected" : undefined
										}
									>
										<TableCell className="min-w-40 whitespace-normal">
											<button
												type="button"
												disabled={isSelectionDisabled}
												onClick={() => onSelectUser(user.key)}
												aria-current={
													selectedUserKey === user.key ? "true" : undefined
												}
												className="flex w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												<Avatar className="size-8 border">
													<AvatarFallback className="bg-background text-[10px]">
														{user.initials}
													</AvatarFallback>
												</Avatar>
												<span className="min-w-0">
													<span className="block truncate text-sm font-medium">
														{user.displayName}
													</span>
													<span className="block max-w-32 truncate text-[11px] text-muted-foreground">
														{user.email}
													</span>
												</span>
											</button>
										</TableCell>
										<TableCell className="whitespace-normal text-xs">
											<span className="flex items-center gap-1.5">
												<StatusMark active={user.lifecycle === "active"} />
												{getLifecycleLabel(user)}
											</span>
										</TableCell>
										<TableCell className="max-w-32 whitespace-normal text-xs text-muted-foreground">
											{user.groups.length
												? user.groups
														.map((key) => SCIM_DEMO_GROUP_LABELS[key])
														.join(", ")
												: "—"}
										</TableCell>
										<TableCell className="whitespace-normal text-xs">
											{getAccessLabel(user)}
										</TableCell>
										<TableCell className="whitespace-normal text-xs text-muted-foreground">
											{user.role ?? "—"}
										</TableCell>
										<TableCell className="whitespace-normal text-xs text-muted-foreground">
											{formatRelativeTime(user.lastSyncedAt)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
					<ul className="divide-y md:hidden" aria-label="Directory users">
						{filteredUsers.map((user) => (
							<li key={user.key}>
								<button
									type="button"
									disabled={isSelectionDisabled}
									onClick={() => onSelectUser(user.key)}
									aria-current={
										selectedUserKey === user.key ? "true" : undefined
									}
									className={cn(
										"w-full p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										selectedUserKey === user.key && "bg-muted",
									)}
								>
									<span className="flex items-start justify-between gap-3">
										<span>
											<span className="block font-medium">
												{user.displayName}
											</span>
											<span className="mt-0.5 block text-xs text-muted-foreground">
												{user.email}
											</span>
										</span>
										<UserStatusBadge user={user} />
									</span>
									<span className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
										<span>Access: {getAccessLabel(user)}</span>
										<span>Role: {user.role ?? "None"}</span>
									</span>
								</button>
							</li>
						))}
					</ul>
				</>
			) : (
				<div className="p-8 text-center">
					<p className="text-sm font-medium">{emptyMessage}</p>
					<Button
						type="button"
						variant="link"
						onClick={() => {
							onSearchChange("");
							onFilterChange("all");
						}}
					>
						Clear search and filters
					</Button>
				</div>
			)}
			<p
				className="border-t p-4 text-xs text-muted-foreground"
				aria-live="polite"
			>
				Showing {filteredUsers.length} of {totalUserCount} users
			</p>
		</section>
	);
}
