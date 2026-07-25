import {
	AlertTriangle,
	Info,
	Lightbulb,
	OctagonAlert,
	Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import type { GithubAlertType } from "@/lib/marketplace/remark-github-alerts";
import { cn } from "@/lib/utils";

const alertConfig: Record<
	GithubAlertType,
	{
		label: string;
		Icon: typeof Info;
		border: string;
		title: string;
		bg: string;
	}
> = {
	note: {
		label: "Note",
		Icon: Info,
		border: "border-blue-500/50",
		title: "text-blue-600 dark:text-blue-400",
		bg: "bg-blue-500/[0.06]",
	},
	tip: {
		label: "Tip",
		Icon: Lightbulb,
		border: "border-emerald-500/50",
		title: "text-emerald-600 dark:text-emerald-400",
		bg: "bg-emerald-500/[0.06]",
	},
	important: {
		label: "Important",
		Icon: Sparkles,
		border: "border-violet-500/50",
		title: "text-violet-600 dark:text-violet-400",
		bg: "bg-violet-500/[0.06]",
	},
	warning: {
		label: "Warning",
		Icon: AlertTriangle,
		border: "border-amber-500/50",
		title: "text-amber-600 dark:text-amber-400",
		bg: "bg-amber-500/[0.06]",
	},
	caution: {
		label: "Caution",
		Icon: OctagonAlert,
		border: "border-red-500/50",
		title: "text-red-600 dark:text-red-400",
		bg: "bg-red-500/[0.06]",
	},
};

export function isGithubAlertType(value: unknown): value is GithubAlertType {
	return typeof value === "string" && value.toLowerCase() in alertConfig;
}

export function GithubAlert({
	type,
	children,
}: {
	type: GithubAlertType;
	children: ReactNode;
}) {
	const config = alertConfig[type];
	const { Icon } = config;

	return (
		<aside
			className={cn(
				"my-4 border px-4 py-3 text-sm not-italic",
				config.border,
				config.bg,
			)}
			data-alert={type}
		>
			<p
				className={cn(
					"mb-2 flex items-center gap-2 font-medium !my-0",
					config.title,
				)}
			>
				<Icon className="size-4 shrink-0" aria-hidden />
				<span>{config.label}</span>
			</p>
			<div className="text-muted-foreground [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
				{children}
			</div>
		</aside>
	);
}
