import React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface TabProps {
	fileName: string;
	isActive: boolean;
	onClick: () => void;
	onClose: () => void;
}

export function CodeTab({ fileName, isActive, onClick, onClose }: TabProps) {
	return (
		<div
			className={cn(
				"flex items-center px-3 py-2 text-sm font-medium border-t-2 cursor-pointer",
				isActive
					? "bg-background text-foreground border-t-foreground"
					: "bg-muted text-muted-foreground border-t-transparent hover:bg-background/50",
			)}
			onClick={onClick}
		>
			<span className="truncate max-w-[100px]">{fileName}</span>
			<button
				className="ml-2 text-muted-foreground hover:text-foreground"
				onClick={(e) => {
					e.stopPropagation();
					onClose();
				}}
			>
				<X size={14} />
			</button>
		</div>
	);
}
