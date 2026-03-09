"use client";
import { cva } from "class-variance-authority";
import type { FeedbackBlockProps } from "fumadocs-core/mdx-plugins/remark-feedback-block";
import {
	CornerDownRightIcon,
	MessageSquare,
	ThumbsDown,
	ThumbsUp,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { z } from "zod/mini";
import { buttonVariants } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import type { ActionResponse, BlockFeedback, PageFeedback } from "./schema";
import { actionResponse, blockFeedback, pageFeedback } from "./schema";
import { cn } from "@/lib/utils";

const rateButtonVariants = cva(
	"inline-flex items-center gap-2 px-3 py-2 font-medium border text-sm [&_svg]:size-4 disabled:cursor-not-allowed",
	{
		variants: {
			active: {
				true: "bg-fd-accent text-fd-accent-foreground [&_svg]:fill-current",
				false: "text-fd-muted-foreground",
			},
		},
	},
);

const pageFeedbackResult = z.extend(pageFeedback, {
	response: actionResponse,
});

const blockFeedbackResult = z.extend(blockFeedback, {
	response: actionResponse,
});

/**
 * A feedback component to be attached at the end of page
 */
export function Feedback({
	onSendAction,
}: {
	onSendAction: (feedback: PageFeedback) => Promise<ActionResponse>;
}) {
	const url = usePathname();
	const { previous, setPrevious } = useSubmissionStorage(url, (v) => {
		const result = pageFeedbackResult.safeParse(v);
		return result.success ? result.data : null;
	});
	const [opinion, setOpinion] = useState<"good" | "bad" | null>(null);
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();

	function submit(e?: SyntheticEvent) {
		if (opinion == null) return;

		startTransition(async () => {
			const feedback: PageFeedback = {
				url,
				opinion,
				message,
			};

			const response = await onSendAction(feedback);
			setPrevious({
				response,
				...feedback,
			});
			setMessage("");
			setOpinion(null);
		});

		e?.preventDefault();
	}

	const activeOpinion = previous?.opinion ?? opinion;

	return (
		<Collapsible
			open={opinion !== null || previous !== null}
			onOpenChange={(v) => {
				if (!v) setOpinion(null);
			}}
			className="border-y py-3"
		>
			<div className="flex flex-row items-center gap-2">
				<p className="text-sm font-medium pe-2">How is this guide?</p>
				<button
					disabled={previous !== null}
					className={cn(
						rateButtonVariants({
							active: activeOpinion === "good",
						}),
					)}
					onClick={() => {
						setOpinion("good");
					}}
				>
					<ThumbsUp />
					Good
				</button>
				<button
					disabled={previous !== null}
					className={cn(
						rateButtonVariants({
							active: activeOpinion === "bad",
						}),
					)}
					onClick={() => {
						setOpinion("bad");
					}}
				>
					<ThumbsDown />
					Bad
				</button>
			</div>
			<CollapsibleContent className="mt-3">
				{previous ? (
					<div className="px-3 py-6 flex flex-col items-center gap-3 bg-fd-card text-fd-muted-foreground text-sm text-center">
						<p>Thank you for your feedback!</p>
						<div className="flex flex-row items-center gap-2">
							<a
								href={previous.response?.githubUrl}
								rel="noreferrer noopener"
								target="_blank"
								className={cn(
									buttonVariants(),
									"text-xs",
								)}
							>
								View on GitHub
							</a>

							<button
								className={cn(
									buttonVariants({
										variant: "secondary",
									}),
									"text-xs",
								)}
								onClick={() => {
									setOpinion(previous.opinion);
									setPrevious(null);
								}}
							>
								Submit Again
							</button>
						</div>
					</div>
				) : (
					<form className="flex flex-col gap-3" onSubmit={submit}>
						<textarea
							autoFocus
							required
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							className="border rounded-lg bg-fd-secondary text-fd-secondary-foreground p-3 resize-none focus-visible:outline-none placeholder:text-fd-muted-foreground"
							placeholder="Leave your feedback..."
							onKeyDown={(e) => {
								if (!e.shiftKey && e.key === "Enter") {
									submit(e);
								}
							}}
						/>
						<button
							type="submit"
							className={cn(buttonVariants({ variant: "outline" }), "w-fit px-3")}
							disabled={isPending}
						>
							Submit
						</button>
					</form>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * A feedback component for each content block in page, should be used with `remark-feedback-block`.
 *
 * See https://fumadocs.dev/docs/integrations/feedback.
 */
export function FeedbackBlock({
	id,
	body,
	onSendAction,
	children,
}: FeedbackBlockProps & {
	onSendAction: (feedback: BlockFeedback) => Promise<ActionResponse>;
	children: ReactNode;
}) {
	const url = usePathname();
	const blockId = `${url}-${id}`;
	const { previous, setPrevious } = useSubmissionStorage(blockId, (v) => {
		const result = blockFeedbackResult.safeParse(v);
		if (result.success) return result.data;
		return null;
	});
	const [message, setMessage] = useState("");
	const [isPending, startTransition] = useTransition();
	const [open, setOpen] = useState(false);

	function submit(e?: SyntheticEvent) {
		startTransition(async () => {
			const feedback: BlockFeedback = {
				blockId,
				blockBody: body,
				url,
				message,
			};

			const response = await onSendAction(feedback);
			setPrevious({
				response,
				...feedback,
			});
			setMessage("");
		});

		e?.preventDefault();
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<div className="relative group/feedback">
				<div
					className={cn(
						"absolute -inset-1 rounded-sm pointer-events-none transition-colors duration-100 z-[-1]",
						open
							? "bg-fd-accent"
							: "group-hover/feedback:bg-fd-accent group-hover/feedback:delay-100",
					)}
				/>
				<PopoverTrigger
					className={cn(
						buttonVariants({ variant: "secondary", size: "sm" }),
						"absolute -top-7 end-0 backdrop-blur-sm text-fd-muted-foreground gap-1.5 transition-all duration-100 data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground",
						!open &&
							"opacity-0 pointer-events-none group-hover/feedback:pointer-events-auto group-hover/feedback:opacity-100 group-hover/feedback:delay-100 hover:pointer-events-auto hover:opacity-100 hover:delay-100",
					)}
					onClick={(e) => {
						setOpen((prev) => !prev);
						e.stopPropagation();
						e.preventDefault();
					}}
				>
					<MessageSquare className="size-3.5" />
					Feedback
				</PopoverTrigger>

				<div className="in-[.prose-no-margin]:prose-no-margin">{children}</div>
			</div>

			<PopoverContent className="min-w-[300px] bg-fd-card text-fd-card-foreground">
				{previous ? (
					<div className="flex flex-col items-center py-2 gap-2 text-fd-muted-foreground text-sm text-center rounded-xl">
						<p>Thank you for your feedback!</p>
						<div className="flex flex-row items-center gap-2">
							<a
								href={previous.response?.githubUrl}
								rel="noreferrer noopener"
								target="_blank"
								className={cn(
									buttonVariants({
										color: "primary",
									}),
									"text-xs",
								)}
							>
								View on GitHub
							</a>

							<button
								className={cn(
									buttonVariants({
										color: "secondary",
									}),
									"text-xs",
								)}
								onClick={() => {
									setPrevious(null);
								}}
							>
								Submit Again
							</button>
						</div>
					</div>
				) : (
					<form className="flex flex-col gap-2" onSubmit={submit}>
						<textarea
							autoFocus
							required
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							className="border rounded-lg bg-fd-secondary text-fd-secondary-foreground p-3 resize-none focus-visible:outline-none placeholder:text-fd-muted-foreground"
							placeholder="Leave your feedback..."
							onKeyDown={(e) => {
								if (!e.shiftKey && e.key === "Enter") {
									submit(e);
								}
							}}
						/>
						<button
							type="submit"
							className={cn(
								buttonVariants({ variant: "secondary", size: "sm" }),
								"gap-1.5",
							)}
							disabled={isPending}
						>
							<CornerDownRightIcon className="text-fd-muted-foreground size-4" />
							Submit
						</button>
					</form>
				)}
			</PopoverContent>
		</Popover>
	);
}

function useSubmissionStorage<Result>(
	blockId: string,
	validate: (v: unknown) => Result | null,
) {
	const storageKey = `docs-feedback-${blockId}`;
	const [value, setValue] = useState<Result | null>(null);
	const validateCallback = useEffectEvent(validate);

	useEffect(() => {
		const item = localStorage.getItem(storageKey);
		if (item === null) return;
		const validated = validateCallback(JSON.parse(item));

		if (validated !== null) setValue(validated);
	}, [storageKey]);

	return {
		previous: value,
		setPrevious(result: Result | null) {
			if (result) localStorage.setItem(storageKey, JSON.stringify(result));
			else localStorage.removeItem(storageKey);

			setValue(result);
		},
	};
}
