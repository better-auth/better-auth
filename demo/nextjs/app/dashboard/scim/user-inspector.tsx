import {
	CircleOff,
	Copy,
	ExternalLink,
	Loader2,
	Pencil,
	Play,
	Trash2,
	UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SCIM_DEMO_GROUP_LABELS } from "@/lib/scim-demo-catalog";
import type {
	SCIMDemoAction,
	SCIMDemoGroupKey,
	SCIMDemoGroupState,
	SCIMDemoOperation,
	SCIMDemoUserAction,
	SCIMDemoUserState,
} from "@/lib/scim-demo-contract";
import {
	EmptyActivity,
	getLifecycleLabel,
	OperationItem,
	UserStatusBadge,
} from "./resource-presentation";

interface UserInspectorProps {
	actionError: string | null;
	connectionReady: boolean;
	draftAction: SCIMDemoUserAction | null;
	draftSummary: string | null;
	groups: SCIMDemoGroupState[];
	hasMoreOperations: boolean;
	isPending: boolean;
	onApplyDraft: () => void;
	onRunAction: (action: SCIMDemoAction, successMessage: string) => void;
	onStageAction: (action: SCIMDemoUserAction) => void;
	onViewAllActivity: () => void;
	operations: SCIMDemoOperation[];
	pendingAction: SCIMDemoAction["type"] | null;
	user: SCIMDemoUserState;
}

export function UserInspector({
	actionError,
	connectionReady,
	draftAction,
	draftSummary,
	groups,
	hasMoreOperations,
	isPending,
	onApplyDraft,
	onRunAction,
	onStageAction,
	onViewAllActivity,
	operations,
	pendingAction,
	user,
}: UserInspectorProps) {
	const [profileDialogOpen, setProfileDialogOpen] = useState(false);
	const [groupDialogOpen, setGroupDialogOpen] = useState(false);
	const [copyStatus, setCopyStatus] = useState<string | null>(null);
	const [profileName, setProfileName] = useState(user.displayName);
	const [selectedGroups, setSelectedGroups] = useState<SCIMDemoGroupKey[]>(
		user.groups,
	);
	const isBusy = isPending;

	useEffect(() => {
		setCopyStatus(null);
		setProfileName(
			draftAction?.type === "update-profile"
				? draftAction.displayName
				: user.displayName,
		);
		setSelectedGroups(
			draftAction?.type === "set-groups" ? draftAction.groupKeys : user.groups,
		);
	}, [draftAction, user]);

	const copyEmployeeLink = async () => {
		try {
			const employeeSignInURL = new URL(
				user.employeePortalPath,
				window.location.origin,
			).toString();
			await navigator.clipboard.writeText(employeeSignInURL);
			setCopyStatus("Employee link copied");
		} catch {
			setCopyStatus(
				"Copy unavailable. Open the preview, then copy its address into a private window.",
			);
		}
	};

	const stageProfileUpdate = () => {
		onStageAction({
			type: "update-profile",
			userKey: user.key,
			displayName: profileName,
		});
		setProfileDialogOpen(false);
	};

	const stageGroupChanges = () => {
		onStageAction({
			type: "set-groups",
			userKey: user.key,
			groupKeys: selectedGroups,
		});
		setGroupDialogOpen(false);
	};

	return (
		<aside className="min-w-0" aria-label="Selected user details">
			<div className="flex items-start justify-between gap-4 border-b px-5 py-4">
				<div className="min-w-0">
					<h2 className="truncate text-xl font-semibold">{user.displayName}</h2>
					<p className="mt-1 truncate text-xs text-muted-foreground">
						{user.email}
					</p>
				</div>
				<UserStatusBadge user={user} />
			</div>

			<section
				className="space-y-4 border-b p-5"
				aria-labelledby="simulator-heading"
			>
				<div>
					<h3 id="simulator-heading" className="text-sm font-semibold">
						Directory changes
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						Stage a change in Acme directory, then send it through the real SCIM
						endpoint.
					</p>
				</div>

				{user.lifecycle === "not-provisioned" ||
				user.lifecycle === "deleted" ? (
					<Button
						type="button"
						className="min-h-11 w-full gap-2 sm:w-auto"
						disabled={!connectionReady || isBusy}
						onClick={() =>
							onRunAction(
								{ type: "provision-user", userKey: user.key },
								user.lifecycle === "deleted"
									? `${user.displayName} was reprovisioned with the retained application identity`
									: `${user.displayName} was provisioned`,
							)
						}
					>
						{pendingAction === "provision-user" ? (
							<Loader2
								className="size-4 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
						) : (
							<Play className="size-4" aria-hidden="true" />
						)}
						{user.lifecycle === "deleted"
							? "Reprovision user"
							: "Provision user"}
					</Button>
				) : (
					<>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-11 gap-2"
								disabled={isBusy}
								onClick={() => {
									setProfileName(
										draftAction?.type === "update-profile"
											? draftAction.displayName
											: user.displayName,
									);
									setProfileDialogOpen(true);
								}}
							>
								<Pencil className="size-3.5" aria-hidden="true" />
								Update profile
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-11 gap-2"
								disabled={isBusy}
								onClick={() => {
									setSelectedGroups(
										draftAction?.type === "set-groups"
											? draftAction.groupKeys
											: user.groups,
									);
									setGroupDialogOpen(true);
								}}
							>
								<UsersRound className="size-3.5" aria-hidden="true" />
								Change groups
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-h-11 gap-2"
								disabled={isBusy}
								onClick={() =>
									onStageAction({
										type: "set-active",
										userKey: user.key,
										active: user.lifecycle === "inactive",
									})
								}
							>
								<CircleOff className="size-3.5" aria-hidden="true" />
								{user.lifecycle === "inactive" ? "Reactivate" : "Deactivate"}
							</Button>
						</div>
						{draftSummary ? (
							<div className="border bg-muted/30 p-3 text-xs">
								<span className="font-medium">Pending directory change:</span>{" "}
								{draftSummary}
							</div>
						) : null}
						<Button
							type="button"
							className="min-h-11 w-full gap-2 sm:w-auto"
							disabled={!draftAction || !connectionReady || isBusy}
							onClick={onApplyDraft}
						>
							{isPending ? (
								<Loader2
									className="size-4 animate-spin motion-reduce:animate-none"
									aria-hidden="true"
								/>
							) : (
								<Play className="size-4" aria-hidden="true" />
							)}
							Apply change
						</Button>
					</>
				)}

				{actionError ? (
					<Alert variant="destructive">
						<CircleOff className="size-4" aria-hidden="true" />
						<AlertTitle>Directory change needs attention</AlertTitle>
						<AlertDescription>
							<p>{actionError}</p>
							{draftAction ? (
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="min-h-11"
									disabled={isBusy}
									onClick={onApplyDraft}
								>
									Try again
								</Button>
							) : null}
						</AlertDescription>
					</Alert>
				) : null}
			</section>

			<section className="border-b p-5" aria-labelledby="identity-heading">
				<h3 id="identity-heading" className="text-sm font-semibold">
					Identity and access
				</h3>
				<dl className="mt-3 divide-y text-xs">
					{[
						["Directory username", user.email, "Directory"],
						["Directory status", getLifecycleLabel(user), "Directory"],
						[
							"SCIM resource ID",
							user.scimResourceId ?? "Not provisioned",
							"SCIM",
						],
						[
							"Better Auth user ID",
							user.applicationUserId ?? "Not created",
							"Better Auth",
						],
						[
							"SSO account",
							user.identityLinkStatus === "linked" ? "Linked" : "Not linked",
							"Better Auth",
						],
						[
							"Employee session",
							user.sessionStatus === "active"
								? "Active session"
								: "No active session",
							"Better Auth",
						],
						[
							"Groups",
							user.groups.length
								? user.groups
										.map((key) => SCIM_DEMO_GROUP_LABELS[key])
										.join(", ")
								: "None",
							"Directory",
						],
						["Provisioned role", user.role ?? "None", "Application"],
					].map(([label, value, provenance]) => (
						<div
							key={label}
							className="grid gap-1 py-2.5 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:gap-3"
						>
							<dt className="text-muted-foreground">{label}</dt>
							<dd className="min-w-0 break-all font-mono text-[11px]">
								{value}
							</dd>
							<dd className="text-muted-foreground sm:text-right">
								{provenance}
							</dd>
						</div>
					))}
				</dl>
				{user.applicationUserId ? (
					<div className="mt-4 border bg-muted/20 p-3">
						<p className="text-xs font-medium">Employee sign-in</p>
						<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
							Open this link in a private window or another browser so the
							employee session stays separate from this administrator session.
						</p>
						<div className="mt-3 flex flex-col gap-2 sm:flex-row">
							<Button
								type="button"
								className="min-h-11 gap-2"
								onClick={() => void copyEmployeeLink()}
							>
								<Copy className="size-4" aria-hidden="true" />
								Copy employee link
							</Button>
							<Button variant="outline" className="min-h-11 gap-2" asChild>
								<a
									href={user.employeePortalPath}
									target="_blank"
									rel="noreferrer"
								>
									<ExternalLink className="size-4" aria-hidden="true" />
									Preview in this session
								</a>
							</Button>
						</div>
						<p
							className="mt-2 min-h-4 text-xs text-muted-foreground"
							aria-live="polite"
						>
							{copyStatus}
						</p>
					</div>
				) : null}
				{user.scimResourceId ? (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="mt-3 min-h-11 gap-2 text-destructive hover:text-destructive"
								disabled={isBusy}
							>
								<Trash2 className="size-3.5" aria-hidden="true" />
								Delete SCIM resource
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Delete {user.displayName}’s SCIM resource?
								</AlertDialogTitle>
								<AlertDialogDescription>
									Better Auth will disable access and retain the application
									identity. You can reprovision the same directory user later.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Cancel</AlertDialogCancel>
								<AlertDialogAction
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									disabled={isBusy}
									onClick={() =>
										onRunAction(
											{ type: "delete-user", userKey: user.key },
											`${user.displayName}’s SCIM resource was deleted; the application identity was retained`,
										)
									}
								>
									Delete resource
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				) : null}
			</section>

			<section className="p-3" aria-labelledby="recent-activity-heading">
				<div className="px-2 py-2">
					<h3 id="recent-activity-heading" className="text-sm font-semibold">
						Recent activity
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						Live SCIM requests and application effects for this user.
					</p>
				</div>
				{operations.length ? (
					<ol className="border">
						{operations.map((operation) => (
							<OperationItem key={operation.id} operation={operation} />
						))}
					</ol>
				) : (
					<EmptyActivity />
				)}
				{hasMoreOperations ? (
					<Button
						type="button"
						variant="link"
						size="sm"
						className="mt-2 min-h-11 px-2"
						onClick={onViewAllActivity}
					>
						View all activity
					</Button>
				) : null}
			</section>

			<Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
				<DialogContent>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							stageProfileUpdate();
						}}
					>
						<DialogHeader>
							<DialogTitle>Update directory profile</DialogTitle>
							<DialogDescription>
								Change the display name Acme directory will send through SCIM.
							</DialogDescription>
						</DialogHeader>
						<label className="mt-5 block space-y-2 text-sm">
							<span className="font-medium">Display name</span>
							<Input
								name="directory-display-name"
								autoComplete="name"
								value={profileName}
								onChange={(event) => setProfileName(event.target.value)}
								minLength={2}
								maxLength={80}
								required
								autoFocus
							/>
						</label>
						<DialogFooter className="mt-6">
							<Button
								type="button"
								variant="outline"
								className="min-h-11"
								onClick={() => setProfileDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" className="min-h-11">
								Stage profile update
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Change directory groups</DialogTitle>
						<DialogDescription>
							Select the complete group membership Acme directory should send
							for this user.
						</DialogDescription>
					</DialogHeader>
					<fieldset className="space-y-2">
						<legend className="sr-only">Directory groups</legend>
						{groups.map((group) => {
							const checked = selectedGroups.includes(group.key);
							return (
								<label
									key={group.key}
									className="flex min-h-11 cursor-pointer items-center gap-3 border p-3 text-sm"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={(nextChecked) =>
											setSelectedGroups((current) =>
												nextChecked === true
													? [...current, group.key]
													: current.filter((key) => key !== group.key),
											)
										}
									/>
									<span className="flex-1">
										<span className="block font-medium">
											{group.displayName}
										</span>
										<span className="mt-0.5 block text-xs text-muted-foreground">
											{group.mappedRole
												? `Maps to ${group.mappedRole}`
												: "No application role mapping"}
										</span>
									</span>
								</label>
							);
						})}
					</fieldset>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => setGroupDialogOpen(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							className="min-h-11"
							onClick={stageGroupChanges}
						>
							Stage group changes
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</aside>
	);
}
