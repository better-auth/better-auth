import { Server } from "lucide-react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "./ui/tooltip";
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
	return (
		<div
			className={cn(
				"relative flex items-center w-full gap-2 p-2 border rounded-md border-muted bg-fd-secondary/50",
				className,
			)}
		>
			<Method method={method} />
			<span className="font-mono text-sm text-muted-foreground">{path}</span>
			{isServerOnly && (
				<div className="absolute right-2">
					<TooltipProvider delayDuration={1}>
						<Tooltip>
							<TooltipTrigger asChild>
								<div className="flex items-center justify-center transition-colors duration-150 ease-in-out size-6 text-muted-foreground/50 hover:text-muted-foreground">
									<Server className="size-4" />
								</div>
							</TooltipTrigger>
							<TooltipContent className="border bg-fd-popover text-fd-popover-foreground border-fd-border">
								Server Only Endpoint
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				</div>
			)}
		</div>
	);
}
