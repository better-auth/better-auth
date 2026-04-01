"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface MessageFeedbackProps {
	messageId: string;
	userMessageId?: string;
	content: string;
	className?: string;
}

export function MessageFeedback({
	messageId,
	userMessageId,
	content,
	className,
}: MessageFeedbackProps) {
	const [feedback, setFeedback] = useState<"positive" | "negative" | null>(
		null,
	);
	const [copied, setCopied] = useState(false);

	const handleFeedback = (type: "positive" | "negative") => {
		if (feedback === type) return;
		setFeedback(type);
	};

	const handleCopy = async () => {
		if (copied) return;
		try {
			await navigator.clipboard.writeText(content);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Silently handle error
		}
	};

	return (
		<div
			className={cn(
				"flex items-center gap-1 mt-3 pt-2 border-t border-fd-border/30",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => handleFeedback("positive")}
				className={cn(
					buttonVariants({
						size: "icon-sm",
						color: feedback === "positive" ? "primary" : "ghost",
						className: cn(
							"h-7 w-7 transition-colors",
							feedback === "positive"
								? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
								: "hover:bg-fd-accent hover:text-fd-accent-foreground",
						),
					}),
				)}
				title="Helpful"
			>
				{feedback === "positive" ? (
					<Check className="h-3.5 w-3.5 text-green-600 animate-in fade-in duration-200" />
				) : (
					<ThumbsUp className="h-3.5 w-3.5 transition-all duration-200" />
				)}
			</button>

			<button
				type="button"
				onClick={() => handleFeedback("negative")}
				className={cn(
					buttonVariants({
						size: "icon-sm",
						color: feedback === "negative" ? "primary" : "ghost",
						className: cn(
							"h-7 w-7 transition-colors",
							feedback === "negative"
								? "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
								: "hover:bg-fd-accent hover:text-fd-accent-foreground",
						),
					}),
				)}
				title="Not helpful"
			>
				{feedback === "negative" ? (
					<Check className="h-3.5 w-3.5 text-green-600 animate-in fade-in duration-200" />
				) : (
					<ThumbsDown className="h-3.5 w-3.5 transition-all duration-200" />
				)}
			</button>

			<button
				type="button"
				onClick={handleCopy}
				className={cn(
					buttonVariants({
						size: "icon-sm",
						color: "ghost",
						className:
							"h-7 w-7 hover:bg-fd-accent hover:text-fd-accent-foreground transition-colors",
					}),
				)}
				title={copied ? "Copied!" : "Copy message"}
			>
				{copied ? (
					<Check className="h-3.5 w-3.5 text-green-600" />
				) : (
					<Copy className="h-3.5 w-3.5" />
				)}
			</button>
		</div>
	);
}
