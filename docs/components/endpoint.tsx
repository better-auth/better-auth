"use client";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useState } from "react";

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
			<div className="absolute right-2" slot="copy">
				<Button
					variant="ghost"
					size="icon"
					className="transition-all duration-150 ease-in-out opacity-0 cursor-pointer scale-80 group-hover:opacity-100"
					onClick={() => {
						setCopying(true);
						navigator.clipboard.writeText(path);
						setTimeout(() => {
							setCopying(false);
						}, 1000);
					}}
				>
					{copying ? (
						<Check className="duration-150 ease-in-out size-4 zoom-in" />
					) : (
						<Copy className="size-4" />
					)}
				</Button>
			</div>
		</div>
	);
}
