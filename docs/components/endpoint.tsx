"use client";
import type { ApiMethodHttpMethod } from "@/lib/api-method";
import { cn } from "@/lib/utils";

const methodColors = {
	GET: "text-green-600 dark:text-green-500",
	POST: "text-yellow-600 dark:text-yellow-600",
	PUT: "text-blue-600 dark:text-blue-400",
	PATCH: "text-cyan-600 dark:text-cyan-400",
	DELETE: "text-red-600 dark:text-red-400",
} satisfies Record<ApiMethodHttpMethod, string>;

function Method({ method }: { method: ApiMethodHttpMethod }) {
	return (
		<span
			className={cn(
				"text-xs font-bold font-mono uppercase",
				methodColors[method],
			)}
		>
			{method}
		</span>
	);
}

export function Endpoint({
	path,
	method,
	className,
}: {
	path: string;
	method: ApiMethodHttpMethod;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative flex items-center w-full gap-2 px-3.5 py-1 border-b border-border bg-fd-muted/80 group",
				className,
			)}
		>
			<Method method={method} />
			<span className="font-mono text-[13px] text-foreground/80 font-medium">
				{path}
			</span>
		</div>
	);
}
