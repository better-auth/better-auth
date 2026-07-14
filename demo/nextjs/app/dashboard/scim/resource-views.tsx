import { ChevronRight, UsersRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SCIM_DEMO_ROLE_MAPPINGS } from "@/lib/scim-demo-catalog";
import type {
	SCIMDemoGroupState,
	SCIMDemoOperation,
} from "@/lib/scim-demo-types";
import { cn } from "@/lib/utils";
import {
	EmptyActivity,
	formatRelativeTime,
	OperationItem,
} from "./resource-presentation";

export function GroupsView({ groups }: { groups: SCIMDemoGroupState[] }) {
	return (
		<section className="p-5 xl:col-span-2" aria-labelledby="groups-heading">
			<div>
				<h2 id="groups-heading" className="text-xl font-semibold">
					Directory groups
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Groups are created through SCIM when you assign the first member.
				</p>
			</div>
			<div className="mt-5 grid gap-3 lg:grid-cols-3">
				{groups.map((group) => (
					<article key={group.key} className="border p-4">
						<div className="flex items-start justify-between gap-3">
							<div className="border bg-muted/30 p-2">
								<UsersRound className="size-4" aria-hidden="true" />
							</div>
							<Badge
								variant="outline"
								className={cn(
									group.created &&
										"border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-400",
								)}
							>
								{group.created ? "Provisioned" : "Not provisioned"}
							</Badge>
						</div>
						<h3 className="mt-4 font-medium">{group.displayName}</h3>
						<p className="mt-1 text-xs text-muted-foreground">
							{group.members.length}{" "}
							{group.members.length === 1 ? "member" : "members"}
						</p>
						<dl className="mt-4 space-y-2 border-t pt-3 text-xs">
							<div className="flex justify-between gap-3">
								<dt className="text-muted-foreground">Mapped role</dt>
								<dd className="font-mono">{group.mappedRole ?? "None"}</dd>
							</div>
							<div className="flex justify-between gap-3">
								<dt className="text-muted-foreground">Last operation</dt>
								<dd>{formatRelativeTime(group.lastSyncedAt)}</dd>
							</div>
						</dl>
					</article>
				))}
			</div>
			<Alert className="mt-5">
				<UsersRound className="size-4" aria-hidden="true" />
				<AlertTitle>Manage membership from a user</AlertTitle>
				<AlertDescription>
					Select Users, open a directory user, and choose Change groups. The
					demo sends the resulting membership delta to the SCIM Groups endpoint.
				</AlertDescription>
			</Alert>
		</section>
	);
}

export function RoleMappingsView() {
	return (
		<section
			className="p-5 xl:col-span-2"
			aria-labelledby="role-mappings-heading"
		>
			<div>
				<h2 id="role-mappings-heading" className="text-xl font-semibold">
					Role mappings
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					See how directory facts become application access.
				</p>
			</div>
			<div className="mt-5 border">
				{SCIM_DEMO_ROLE_MAPPINGS.map((mapping) => (
					<div
						key={mapping.groupKey}
						className="grid gap-4 border-b bg-muted/20 p-4 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center"
					>
						<div>
							<p className="text-xs text-muted-foreground">Directory group</p>
							<p className="mt-1 font-medium">{mapping.groupDisplayName}</p>
						</div>
						<ChevronRight
							className="hidden size-4 text-muted-foreground sm:block"
							aria-hidden="true"
						/>
						<div>
							<p className="text-xs text-muted-foreground">Better Auth role</p>
							<p className="mt-1 font-mono text-sm">{mapping.role}</p>
						</div>
						<Badge variant="outline">Demo configuration</Badge>
					</div>
				))}
				<div className="p-4 text-sm text-muted-foreground">
					This mapping is defined in the demo application’s SCIM projection.
					Membership grants the role while the user is active; deactivation
					revokes it without removing the group membership.
				</div>
			</div>
		</section>
	);
}

export function ActivityView({
	operations,
}: {
	operations: SCIMDemoOperation[];
}) {
	return (
		<section className="p-5 xl:col-span-2" aria-labelledby="activity-heading">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 id="activity-heading" className="text-xl font-semibold">
						SCIM activity
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Requests sent since you opened this page and their application
						effects
					</p>
				</div>
				<Badge variant="outline">{operations.length} operations</Badge>
			</div>
			{operations.length ? (
				<ol className="mt-5 border">
					{operations.map((operation) => (
						<OperationItem key={operation.id} operation={operation} />
					))}
				</ol>
			) : (
				<div className="mt-5">
					<EmptyActivity />
				</div>
			)}
		</section>
	);
}
