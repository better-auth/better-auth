"use client";
import { cn } from "@/lib/utils";

const methodColors: Record<string, string> = {
	GET: "text-emerald-700 dark:text-emerald-400",
	POST: "text-blue-700 dark:text-blue-400",
	PUT: "text-amber-700 dark:text-amber-400",
	DELETE: "text-red-700 dark:text-red-400",
};

function Method({ method }: { method: "POST" | "GET" | "DELETE" | "PUT" }) {
	return (
		<span
			className={cn(
				"text-[11px] font-bold font-mono uppercase tracking-wider",
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
	isServerOnly,
	className,
}: {
	path: string;
	method: "POST" | "GET" | "DELETE" | "PUT";
	isServerOnly?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"relative flex items-center w-full gap-3 px-3.5 py-2.5 border-t border-x border-border bg-fd-secondary/50 dark:border-white/[0.06] dark:bg-[#050505] group",
				className,
			)}
		>
			<Method method={method} />
			<span className="font-mono text-[12px] text-muted-foreground/70">
				{path}
			</span>
		</div>
	);
}
