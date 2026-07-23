"use client";

import { Activity, CheckCircle2, ChevronRight, CircleOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type {
	SCIMDemoOperation,
	SCIMDemoUserState,
} from "@/lib/scim-demo-contract";
import { cn } from "@/lib/utils";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	hour: "2-digit",
	hourCycle: "h23",
	minute: "2-digit",
	month: "short",
	timeZone: "UTC",
	timeZoneName: "short",
	year: "numeric",
});

function parseTimestamp(value: string | null) {
	if (!value) return null;
	const timestamp = new Date(value);
	return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function formatTimestamp(timestamp: Date) {
	return timestampFormatter.format(timestamp);
}

export function formatRelativeTime(value: string | null, now?: number) {
	if (!value) return "Never";
	const timestamp = parseTimestamp(value);
	if (!timestamp) return "Unknown";
	if (now === undefined) return formatTimestamp(timestamp);

	const elapsed = now - timestamp.getTime();
	if (elapsed < -60_000) return formatTimestamp(timestamp);
	if (elapsed < 60_000) return "Just now";
	if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`;
	if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`;
	return formatTimestamp(timestamp);
}

function getRelativeTimeRefreshDelay(value: string, now: number) {
	const timestamp = parseTimestamp(value);
	if (!timestamp) return null;

	const elapsed = now - timestamp.getTime();
	if (elapsed < -60_000 || elapsed >= 86_400_000) return null;
	if (elapsed < 60_000) return 60_000 - elapsed;
	if (elapsed < 3_600_000) return 60_000 - (elapsed % 60_000);
	return 3_600_000 - (elapsed % 3_600_000);
}

function RelativeTime({ value }: { value: string }) {
	const [now, setNow] = useState<number | undefined>();

	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const refresh = () => {
			const currentTime = Date.now();
			setNow(currentTime);
			const delay = getRelativeTimeRefreshDelay(value, currentTime);
			if (delay !== null) {
				timeout = setTimeout(refresh, Math.max(1_000, delay + 50));
			}
		};

		refresh();
		return () => {
			if (timeout) clearTimeout(timeout);
		};
	}, [value]);

	return (
		<time dateTime={value} title={formatRelativeTime(value)}>
			{formatRelativeTime(value, now)}
		</time>
	);
}

export function getLifecycleLabel(user: SCIMDemoUserState) {
	switch (user.lifecycle) {
		case "active":
			return "Active";
		case "inactive":
			return "Inactive";
		case "deleted":
			return "Deleted";
		case "not-provisioned":
			return "Not provisioned";
	}
}

export function StatusMark({ active }: { active: boolean }) {
	return active ? (
		<CheckCircle2
			className="size-4 shrink-0 text-green-600 dark:text-green-400"
			aria-hidden="true"
		/>
	) : (
		<CircleOff
			className="size-4 shrink-0 text-muted-foreground"
			aria-hidden="true"
		/>
	);
}

export function UserStatusBadge({ user }: { user: SCIMDemoUserState }) {
	const active = user.lifecycle === "active";
	return (
		<Badge
			variant="outline"
			className={cn(
				"gap-1.5 font-medium",
				active &&
					"border-green-600/40 bg-green-500/10 text-green-700 dark:text-green-400",
			)}
		>
			<StatusMark active={active} />
			{getLifecycleLabel(user)}
		</Badge>
	);
}

export function OperationItem({ operation }: { operation: SCIMDemoOperation }) {
	return (
		<li className="border-b last:border-b-0">
			<details className="group px-3 py-3">
				<summary className="flex cursor-pointer list-none items-start gap-3 marker:hidden">
					<div className="mt-0.5 border p-1.5" aria-hidden="true">
						<Activity className="size-3.5" />
					</div>
					<div className="min-w-0 flex-1 space-y-1">
						<div className="flex flex-wrap items-center gap-2 font-mono text-xs">
							<span className="font-semibold text-green-700 dark:text-green-400">
								{operation.method}
							</span>
							<span className="max-w-52 truncate" title={operation.resource}>
								{operation.resource}
							</span>
							<Badge
								variant="outline"
								className="h-5 border-green-600/30 bg-green-500/10 px-1.5 font-mono text-[10px] text-green-700 dark:text-green-400"
							>
								{operation.status}
							</Badge>
						</div>
						<p className="text-xs text-muted-foreground">Application effect</p>
						<p className="text-sm">{operation.effect}</p>
					</div>
					<div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
						<RelativeTime value={operation.createdAt} />
						<span className="hidden sm:inline">View request</span>
						<ChevronRight className="size-4 transition-transform group-open:rotate-90" />
					</div>
				</summary>
				<div className="mt-3 space-y-3 border-t pt-3 text-xs">
					{operation.requestBody ? (
						<div className="space-y-1.5">
							<p className="font-medium">Request body</p>
							<pre className="max-h-48 overflow-auto bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
								{operation.requestBody}
							</pre>
						</div>
					) : null}
					{operation.responseBody ? (
						<div className="space-y-1.5">
							<p className="font-medium">Response body</p>
							<pre className="max-h-48 overflow-auto bg-muted/50 p-3 font-mono text-[11px] leading-relaxed">
								{operation.responseBody}
							</pre>
						</div>
					) : (
						<p className="text-muted-foreground">
							The SCIM endpoint returned an empty {operation.status} response.
						</p>
					)}
				</div>
			</details>
		</li>
	);
}

export function EmptyActivity() {
	return (
		<div className="border border-dashed p-6 text-center">
			<Activity
				className="mx-auto size-5 text-muted-foreground"
				aria-hidden="true"
			/>
			<p className="mt-3 text-sm font-medium">No SCIM operations yet</p>
			<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
				Run a directory action to see activity recorded since you opened this
				page
			</p>
		</div>
	);
}
