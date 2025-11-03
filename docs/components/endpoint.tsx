"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";

function Method({ method }: { method: "POST" | "GET" | "DELETE" | "PUT" }) {
	return (
		<div className="flex items-center justify-center h-6 px-2 text-sm font-semibold uppercase border rounded-lg select-none w-fit font-display bg-background">
			{method}
		</div>
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
	const [copying, setCopying] = useState(false);
	return (
		<div
			className={cn(
				"relative flex items-center w-full gap-2 p-2 border-t border-x border-border bg-fd-secondary/50 group",
				className,
			)}
		>
			<Method method={method} />
			<span className="font-mono text-sm text-muted-foreground">{path}</span>
		</div>
	);
}
