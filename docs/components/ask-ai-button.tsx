"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { AIChatModal } from "@/components/ai-chat-modal";

interface AskAIButtonProps {
	className?: string;
}

export function AskAIButton({ className }: AskAIButtonProps) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => setIsOpen(true)}
				className={cn(
					"flex items-center gap-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
					className,
				)}
			>
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
					className="text-primary"
				>
					<path
						d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z"
						fill="currentColor"
					/>
					<path
						d="M19 15L19.5 17.5L22 18L19.5 18.5L19 21L18.5 18.5L16 18L18.5 17.5L19 15Z"
						fill="currentColor"
					/>
					<path
						d="M5 15L5.5 17.5L8 18L5.5 18.5L5 21L4.5 18.5L2 18L4.5 17.5L5 15Z"
						fill="currentColor"
					/>
				</svg>
				<span className="hidden md:inline">Ask AI</span>
			</Button>
			<AIChatModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
		</>
	);
}
