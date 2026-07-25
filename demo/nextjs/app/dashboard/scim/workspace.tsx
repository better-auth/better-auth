"use client";

import {
	Activity,
	CircleOff,
	Network,
	RefreshCcw,
	ShieldCheck,
	UserRound,
	UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SCIM_DEMO_GROUP_LABELS } from "@/lib/scim-demo-catalog";
import type {
	SCIMDemoAction,
	SCIMDemoOperation,
	SCIMDemoUserAction,
	SCIMDemoUserKey,
	SCIMDemoView,
	SCIMDemoWorkspace,
} from "@/lib/scim-demo-contract";
import {
	isSCIMDemoActionFailure,
	isSCIMDemoActionResult,
	isSCIMDemoUserKey,
	isSCIMDemoWorkspace,
} from "@/lib/scim-demo-contract";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "./resource-presentation";
import { ActivityView, GroupsView, RoleMappingsView } from "./resource-views";
import { UserInspector } from "./user-inspector";
import type { UserFilter } from "./user-list";
import { UserList } from "./user-list";

const resourceNavigation: ReadonlyArray<{
	icon: typeof UserRound;
	label: string;
	view: SCIMDemoView;
}> = [
	{ view: "users", label: "Users", icon: UserRound },
	{ view: "groups", label: "Groups", icon: UsersRound },
	{ view: "role-mappings", label: "Role mappings", icon: ShieldCheck },
	{ view: "activity", label: "Activity", icon: Activity },
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isView(value: string | null): value is SCIMDemoView {
	return resourceNavigation.some((item) => item.view === value);
}

function getResponseError(body: unknown, status: number) {
	if (isRecord(body) && typeof body.error === "string") return body.error;
	return `The SCIM demo request failed with status ${status}`;
}

function prependOperations(
	operations: SCIMDemoOperation[],
	completedOperations: SCIMDemoOperation[],
) {
	return [...[...completedOperations].reverse(), ...operations].slice(0, 50);
}

function LoadingWorkspace() {
	return (
		<div
			className="border bg-background/95"
			aria-busy="true"
			aria-label="Loading SCIM workspace"
		>
			<div className="grid min-h-[34rem] animate-pulse motion-reduce:animate-none xl:grid-cols-[10.5rem_minmax(0,1.25fr)_minmax(23rem,.75fr)] 2xl:grid-cols-[12rem_minmax(0,1.1fr)_minmax(26rem,.9fr)]">
				<div className="border-b bg-muted/20 p-4 xl:border-r xl:border-b-0">
					<div className="h-9 bg-muted" />
				</div>
				<div className="space-y-3 border-b p-5 xl:border-r xl:border-b-0">
					<div className="h-9 bg-muted" />
					<div className="h-14 bg-muted" />
					<div className="h-14 bg-muted" />
					<div className="h-14 bg-muted" />
				</div>
				<div className="space-y-4 p-5">
					<div className="h-12 bg-muted" />
					<div className="h-24 bg-muted" />
					<div className="h-48 bg-muted" />
				</div>
			</div>
		</div>
	);
}

interface SCIMWorkspaceProps {
	initialError?: string | null;
	initialWorkspace: SCIMDemoWorkspace | null;
}

export function SCIMWorkspace({
	initialError = null,
	initialWorkspace,
}: SCIMWorkspaceProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const requestedView = searchParams.get("view");
	const requestedUserKey = searchParams.get("user");
	const view = isView(requestedView) ? requestedView : "users";
	const selectedUserKey = isSCIMDemoUserKey(requestedUserKey)
		? requestedUserKey
		: "maya-chen";
	const [workspace, setWorkspace] = useState<SCIMDemoWorkspace | null>(
		initialWorkspace,
	);
	const [operations, setOperations] = useState<SCIMDemoOperation[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [pendingAction, setPendingAction] = useState<
		SCIMDemoAction["type"] | null
	>(null);
	const [draftActions, setDraftActions] = useState<
		Partial<Record<SCIMDemoUserKey, SCIMDemoUserAction>>
	>({});
	const [workspaceError, setWorkspaceError] = useState<string | null>(
		initialError,
	);
	const [actionError, setActionError] = useState<{
		message: string;
		userKey: SCIMDemoUserKey | null;
	} | null>(null);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<UserFilter>("all");
	const actionInFlight = useRef(false);

	const reloadWorkspace = async () => {
		const response = await fetch("/api/scim-demo", {
			headers: { accept: "application/json" },
			cache: "no-store",
		});
		const body: unknown = await response.json().catch(() => undefined);
		if (!response.ok) throw new Error(getResponseError(body, response.status));
		if (!isSCIMDemoWorkspace(body)) {
			throw new Error("The SCIM workspace returned an invalid response");
		}
		setWorkspace(body);
		return body;
	};

	const retryWorkspace = async () => {
		setIsLoading(true);
		setWorkspaceError(null);
		try {
			await reloadWorkspace();
			toast.success("Directory status refreshed");
		} catch (loadError) {
			const message =
				loadError instanceof Error
					? loadError.message
					: "The SCIM workspace could not be loaded";
			setWorkspaceError(message);
			setWorkspace((current) =>
				current
					? {
							...current,
							connection: {
								...current.connection,
								status: "error",
								detail: message,
							},
						}
					: current,
			);
		} finally {
			setIsLoading(false);
		}
	};

	const selectedUser = workspace?.users.find(
		(user) => user.key === selectedUserKey,
	);
	const draftAction = draftActions[selectedUserKey] ?? null;

	const getRouteHref = (nextView: SCIMDemoView, userKey?: SCIMDemoUserKey) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("view", nextView);
		if (userKey) params.set("user", userKey);
		return `/dashboard/scim?${params.toString()}`;
	};

	const updateRoute = (nextView: SCIMDemoView, userKey?: SCIMDemoUserKey) => {
		router.replace(getRouteHref(nextView, userKey), { scroll: false });
	};

	const runAction = async (action: SCIMDemoAction, successMessage: string) => {
		if (actionInFlight.current) return;
		actionInFlight.current = true;
		const actionUserKey = "userKey" in action ? action.userKey : null;
		setPendingAction(action.type);
		setActionError(null);
		let partialFailureReconciled = false;
		try {
			const response = await fetch("/api/scim-demo", {
				method: "POST",
				headers: {
					accept: "application/json",
					"content-type": "application/json",
				},
				body: JSON.stringify(action),
			});
			const body: unknown = await response.json().catch(() => undefined);
			if (!response.ok) {
				if (isSCIMDemoActionFailure(body)) {
					partialFailureReconciled = true;
					setWorkspace(body.workspace);
					setOperations((current) =>
						prependOperations(current, body.operations),
					);
					throw new Error(
						`${body.error} Some directory changes completed before the request stopped. The current state was refreshed; completed changes are shown.`,
					);
				}
				throw new Error(getResponseError(body, response.status));
			}
			if (!isSCIMDemoActionResult(body)) {
				throw new Error("The directory change returned an invalid response");
			}
			setWorkspace(body.workspace);
			if (action.type === "reset-sandbox") {
				setOperations([]);
				setDraftActions({});
			} else {
				setOperations((current) => prependOperations(current, body.operations));
				setDraftActions((current) => {
					const nextDrafts = { ...current };
					delete nextDrafts[action.userKey];
					return nextDrafts;
				});
			}
			toast.success(successMessage);
		} catch (actionError) {
			const actionMessage =
				actionError instanceof Error
					? actionError.message
					: "The directory change could not be applied";
			let message = actionMessage;
			if (!partialFailureReconciled) {
				try {
					await reloadWorkspace();
					message = `${actionMessage} The current state was refreshed; any completed changes are shown.`;
				} catch {
					message = `${actionMessage} The current state could not be refreshed.`;
				}
			}
			setActionError({ message, userKey: actionUserKey });
			toast.error(actionMessage);
		} finally {
			actionInFlight.current = false;
			setPendingAction(null);
		}
	};

	const filteredUsers = useMemo(() => {
		if (!workspace) return [];
		const query = search.trim().toLowerCase();
		return workspace.users.filter((user) => {
			const matchesSearch =
				!query ||
				user.displayName.toLowerCase().includes(query) ||
				user.email.toLowerCase().includes(query);
			const provisioned =
				user.lifecycle === "active" || user.lifecycle === "inactive";
			const matchesFilter =
				filter === "all" ||
				(filter === "provisioned" && provisioned) ||
				(filter === "not-provisioned" && !provisioned);
			return matchesSearch && matchesFilter;
		});
	}, [filter, search, workspace]);
	const selectedUserIsVisible = filteredUsers.some(
		(user) => user.key === selectedUserKey,
	);

	const selectedUserOperations = operations
		.filter((operation) => operation.userKey === selectedUserKey)
		.slice(0, 3);
	const connectionReady = workspace?.connection.status === "connected";
	const isPending = pendingAction !== null;
	const selectedActionError =
		actionError?.userKey === selectedUserKey ? actionError.message : null;
	const clearUserFilters = () => {
		setSearch("");
		setFilter("all");
	};

	const stageAction = (action: SCIMDemoUserAction) => {
		setDraftActions((current) => ({
			...current,
			[action.userKey]: action,
		}));
		if (actionError?.userKey === action.userKey) setActionError(null);
	};

	const applyDraft = () => {
		if (!draftAction || !selectedUser) return;
		let successMessage = `${selectedUser.displayName} was updated`;
		if (draftAction.type === "set-groups") {
			successMessage = `${selectedUser.displayName}’s groups were synchronized`;
		}
		if (draftAction.type === "set-active") {
			successMessage = draftAction.active
				? `${selectedUser.displayName} was reactivated. Application access is active.`
				: `${selectedUser.displayName} was deactivated. Application access is disabled.`;
		}
		void runAction(draftAction, successMessage);
	};

	const draftSummary = (() => {
		if (!draftAction) return null;
		switch (draftAction.type) {
			case "update-profile":
				return `Update profile name to ${draftAction.displayName}`;
			case "set-groups":
				return draftAction.groupKeys.length > 0
					? `Set groups to ${draftAction.groupKeys.map((key) => SCIM_DEMO_GROUP_LABELS[key]).join(", ")}`
					: "Remove all group memberships";
			case "set-active":
				return draftAction.active
					? "Reactivate application access"
					: "Deactivate application access";
			default:
				return null;
		}
	})();

	return (
		<div className="space-y-5">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-1.5">
					<Badge variant="outline">Administrator</Badge>
					<h1 className="text-3xl font-semibold tracking-tight">
						Directory provisioning
					</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						Provision users and groups from Acme, then verify employee sign-in
						in a separate browser session.
					</p>
				</div>
				<div className="grid gap-3 sm:grid-cols-[minmax(18rem,1fr)_auto]">
					<div className="flex min-h-16 items-center gap-3 border bg-background/90 px-4 py-3">
						<span
							className={cn(
								"size-2.5 rounded-full ring-4 ring-muted",
								workspace?.connection.status === "connected"
									? "bg-green-500"
									: "bg-destructive",
							)}
							aria-hidden="true"
						/>
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium">
								{workspace?.connection.name ?? "Acme directory"}:{" "}
								{workspace?.connection.status === "connected"
									? "Connected"
									: workspace
										? "Connection error"
										: "Checking"}
							</p>
							<p className="mt-0.5 truncate text-xs text-muted-foreground">
								{workspace?.connection.status === "error"
									? workspace.connection.detail
									: workspace?.connection.lastSyncedAt
										? `Last SCIM operation: ${formatRelativeTime(workspace.connection.lastSyncedAt)}`
										: "Credential configured on server"}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="min-h-11 shrink-0 gap-2"
							disabled={isLoading || isPending}
							onClick={() => void retryWorkspace()}
						>
							<RefreshCcw
								className={cn(
									"size-3.5",
									isLoading && "animate-spin motion-reduce:animate-none",
								)}
								aria-hidden="true"
							/>
							{workspace?.connection.status === "error"
								? "Retry connection"
								: "Refresh status"}
						</Button>
					</div>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="outline"
								className="h-16 gap-2 px-5"
								disabled={isPending || !connectionReady}
							>
								<RefreshCcw className="size-4" aria-hidden="true" />
								Reset sandbox
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Reset the SCIM sandbox?</AlertDialogTitle>
								<AlertDialogDescription>
									This removes your provisioned SCIM resources, demo application
									users, and activity. The three source directory users remain
									available.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									disabled={isPending || !connectionReady}
									onClick={() =>
										void runAction(
											{ type: "reset-sandbox" },
											"SCIM sandbox reset",
										)
									}
								>
									Reset sandbox
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>

			<section
				className="border bg-background/95 p-4"
				aria-labelledby="demo-guide-heading"
			>
				<h2 id="demo-guide-heading" className="text-sm font-semibold">
					Demo guide
				</h2>
				<ol className="mt-3 grid gap-3 md:grid-cols-3">
					{[
						{
							title: "Provision a user",
							description:
								"Create the Better Auth user from the directory record",
						},
						{
							title: "Sign in as employee",
							description:
								"Open the employee portal in a private window and continue with Acme SSO",
						},
						{
							title: "Change access",
							description:
								"Deactivate the user or change their groups, then retry from the employee session",
						},
					].map((step, index) => (
						<li key={step.title} className="flex gap-3 border bg-muted/10 p-3">
							<span
								className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background text-xs font-semibold"
								aria-hidden="true"
							>
								{index + 1}
							</span>
							<div>
								<p className="text-sm font-medium">{step.title}</p>
								<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
									{step.description}
								</p>
							</div>
						</li>
					))}
				</ol>
			</section>

			{isLoading && !workspace ? <LoadingWorkspace /> : null}
			{!isLoading && !workspace ? (
				<Alert variant="destructive">
					<Network className="size-4" aria-hidden="true" />
					<AlertTitle>SCIM workspace unavailable</AlertTitle>
					<AlertDescription>
						<p>{workspaceError ?? "The workspace could not be loaded."}</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void retryWorkspace()}
						>
							Try again
						</Button>
					</AlertDescription>
				</Alert>
			) : null}
			{actionError?.userKey === null ? (
				<Alert variant="destructive">
					<CircleOff className="size-4" aria-hidden="true" />
					<AlertTitle>Sandbox reset needs attention</AlertTitle>
					<AlertDescription>{actionError.message}</AlertDescription>
				</Alert>
			) : null}

			{workspace ? (
				<div className="border bg-background/95">
					<div className="grid min-h-[42rem] xl:grid-cols-[10.5rem_minmax(0,1.25fr)_minmax(23rem,.75fr)] 2xl:grid-cols-[12rem_minmax(0,1.1fr)_minmax(26rem,.9fr)]">
						<nav
							className="border-b bg-muted/10 p-2 xl:border-r xl:border-b-0 xl:p-3"
							aria-label="SCIM resources"
						>
							<ul className="flex gap-1 overflow-x-auto xl:flex-col">
								{resourceNavigation.map((item) => {
									const Icon = item.icon;
									return (
										<li key={item.view}>
											<Link
												href={getRouteHref(item.view)}
												aria-current={view === item.view ? "page" : undefined}
												className={cn(
													"flex min-h-11 w-full items-center gap-3 whitespace-nowrap px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
													view === item.view &&
														"bg-muted font-medium text-foreground",
												)}
											>
												<Icon className="size-4" aria-hidden="true" />
												{item.label}
											</Link>
										</li>
									);
								})}
							</ul>
						</nav>

						{view === "users" ? (
							<>
								<UserList
									filter={filter}
									filteredUsers={filteredUsers}
									getUserHref={(userKey) => getRouteHref("users", userKey)}
									isSelectionDisabled={isPending}
									onFilterChange={setFilter}
									onSearchChange={setSearch}
									search={search}
									selectedUserKey={selectedUserKey}
									totalUserCount={workspace.users.length}
								/>
								{selectedUser && selectedUserIsVisible ? (
									<UserInspector
										actionError={selectedActionError}
										connectionReady={connectionReady}
										draftAction={draftAction}
										draftSummary={draftSummary}
										groups={workspace.groups}
										hasMoreOperations={
											operations.length > selectedUserOperations.length
										}
										isPending={isPending}
										onApplyDraft={applyDraft}
										onRunAction={(action, successMessage) =>
											void runAction(action, successMessage)
										}
										onStageAction={stageAction}
										onViewAllActivity={() => updateRoute("activity")}
										operations={selectedUserOperations}
										pendingAction={pendingAction}
										user={selectedUser}
									/>
								) : (
									<aside className="p-8" aria-label="Selected user details">
										<h2 className="text-base font-semibold">
											Selected user is hidden
										</h2>
										<p className="mt-2 max-w-sm text-sm text-muted-foreground">
											Select a visible user or clear the current search and
											filters to inspect{" "}
											{selectedUser?.displayName ?? "their details"}.
										</p>
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="mt-4 min-h-11"
											onClick={clearUserFilters}
										>
											Clear search and filters
										</Button>
									</aside>
								)}
							</>
						) : null}
						{view === "groups" ? (
							<GroupsView groups={workspace.groups} />
						) : null}
						{view === "role-mappings" ? <RoleMappingsView /> : null}
						{view === "activity" ? (
							<ActivityView operations={operations} />
						) : null}
					</div>
				</div>
			) : null}
		</div>
	);
}
