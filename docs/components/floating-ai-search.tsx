"use client";

import type { UIMessage, UseChatHelpers } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { Presence } from "@radix-ui/react-presence";
import { DefaultChatTransport } from "ai";
import Link from "fumadocs-core/link";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { Bot, InfoIcon, Loader2, Send, Trash2, X } from "lucide-react";
import type { ComponentProps, SyntheticEvent } from "react";
import {
	createContext,
	use,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { RemoveScroll } from "react-remove-scroll";
import type * as z from "zod";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ProvideLinksToolSchema } from "@/lib/chat/inkeep-qa-schema";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { MessageFeedback } from "./message-feedback";

const Context = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
	chat: UseChatHelpers<UIMessage>;
} | null>(null);

function useChatContext() {
	return use(Context)!.chat;
}

// function SearchAIActions() {
// 	const { messages, status, setMessages, stop } = useChatContext();
// 	const isGenerating = status === "streaming" || status === "submitted";

// 	if (messages.length === 0) return null;

// 	return (
// 		<>
// 			<button
// 				type="button"
// 				className={cn(
// 					buttonVariants({
// 						color: "secondary",
// 						size: "sm",
// 						className: "rounded-none",
// 					}),
// 				)}
// 				onClick={isGenerating ? stop : () => setMessages([])}
// 			>
// 				{isGenerating ? "Cancel" : "Clear Chat"}
// 			</button>
// 		</>
// 	);
// }

const suggestions = [
	"How to configure Sqlite database?",
	"How to require email verification?",
	"How to change session expiry?",
	"How to share cookies across subdomains?",
];

function SearchAIInput(props: ComponentProps<"form"> & { isMobile?: boolean }) {
	const { status, sendMessage, stop, messages, setMessages } = useChatContext();
	const [input, setInput] = useState("");
	const isLoading = status === "streaming" || status === "submitted";
	const showSuggestions = messages.length === 0 && !isLoading;

	const onStart = (e?: SyntheticEvent) => {
		e?.preventDefault();
		void sendMessage({ text: input });
		setInput("");
	};

	const handleSuggestionClick = (suggestion: string) => {
		void sendMessage({ text: suggestion });
	};

	const handleClear = () => {
		setMessages([]);
		setInput("");
	};

	useEffect(() => {
		if (isLoading) document.getElementById("nd-ai-input")?.focus();
	}, [isLoading]);

	const { isMobile, ...formProps } = props;

	return (
		<div
			className={cn(
				"flex relative flex-col rounded-lg border shadow-2xl bg-fd-background m-[1px] border-fd-border shadow-fd-background",
				isLoading ? "opacity-50" : "",
			)}
		>
			<form
				{...formProps}
				className={cn("flex items-start pe-2", props.className)}
				onSubmit={onStart}
			>
				<Input
					value={input}
					placeholder={isLoading ? "answering..." : "Ask BA Bot"}
					autoFocus
					className={cn("p-4", "sm:text-sm")}
					disabled={status === "streaming" || status === "submitted"}
					onChange={(e) => {
						setInput(e.target.value);
					}}
					onKeyDown={(event) => {
						if (!event.shiftKey && event.key === "Enter") {
							onStart(event);
						}
					}}
				/>
				{isLoading ? (
					<button
						key="bn"
						type="button"
						className={cn(
							buttonVariants({
								color: "secondary",
								className: "gap-2 mt-2 rounded-full transition-all",
							}),
						)}
						onClick={stop}
					>
						<Loader2 className="animate-spin size-4 text-fd-muted-foreground" />
					</button>
				) : (
					<button
						key="bn"
						type="submit"
						className={cn(
							buttonVariants({
								color: "secondary",
								className: "mt-2 rounded-full transition-all",
							}),
						)}
						disabled={input.length === 0}
					>
						<Send className="size-4" />
					</button>
				)}
			</form>

			{showSuggestions && (
				<div className={cn("mt-3", props.isMobile ? "px-3" : "px-4")}>
					<p className="mb-2 text-xs font-medium text-fd-muted-foreground">
						Try asking:
					</p>
					<div
						className={cn(
							"flex gap-2 overflow-x-auto  pb-2 -mx-3 px-3 [mask-image:linear-gradient(to_right,transparent_0%,black_1rem,black_calc(100%-1rem),transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,black_1rem,black_calc(100%-1rem),transparent_100%)]",
						)}
					>
						{suggestions.slice(0, 4).map((suggestion, i) => (
							<button
								key={i}
								onClick={() => handleSuggestionClick(suggestion)}
								className={cn(
									"bg-fd-muted/30 hover:bg-fd-muted/50 text-fd-muted-foreground hover:text-fd-foreground rounded-full border border-fd-border/50 hover:border-fd-border transition-all duration-200 text-left text-nowrap text-xs px-3 py-1.5 whitespace-nowrap flex-shrink-0",
								)}
							>
								{suggestion}
							</button>
						))}
					</div>
				</div>
			)}
			{showSuggestions && (
				<div className="border-t px-4 text-xs text-fd-muted-foreground bg-fd-accent/40 flex items-center gap-1 mt-2 py-2 relative">
					<div className="flex items-center gap-1 flex-1 truncate">
						Powered by{" "}
						<Link
							href="https://inkeep.com"
							target="_blank"
							rel="noopener noreferrer"
							className="text-fd-primary hover:text-fd-primary/80 hover:underline"
						>
							Inkeep.
						</Link>
						<span className="hidden sm:inline">
							AI can be inaccurate, please verify the information.
						</span>
					</div>
					<Popover>
						<PopoverTrigger asChild>
							<button
								className="rounded transition-colors sm:hidden hover:bg-fd-accent/50"
								aria-label="Show information"
							>
								<InfoIcon className="size-3.5" />
							</button>
						</PopoverTrigger>
						<PopoverContent
							side="top"
							align="end"
							className="p-2 w-auto text-xs max-w-44 text-pretty"
						>
							AI can be inaccurate, please verify the information.
						</PopoverContent>
					</Popover>
				</div>
			)}
			{!showSuggestions && (
				<div className="flex gap-1 items-center px-4 py-2 mt-2 text-xs border-t cursor-pointer text-fd-muted-foreground bg-fd-accent/40">
					<div
						className="flex gap-1 items-center transition-all duration-200 empty:hidden hover:text-fd-foreground aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
						role="button"
						aria-disabled={isLoading}
						tabIndex={0}
						onClick={() => {
							if (!isLoading) {
								handleClear();
							}
						}}
					>
						<Trash2 className="size-3" />
						<p>Clear</p>
					</div>
				</div>
			)}
		</div>
	);
}

function List(
	props: Omit<ComponentProps<"div">, "dir"> & { messageCount: number },
) {
	const containerRef = useRef<HTMLDivElement>(null);
	const isUserScrollingRef = useRef(false);
	const prevMessageCountRef = useRef(props.messageCount);

	// Scroll to bottom when new message is submitted
	useEffect(() => {
		if (props.messageCount > prevMessageCountRef.current) {
			// New message submitted, reset scroll lock and scroll to bottom
			isUserScrollingRef.current = false;
			if (containerRef.current) {
				containerRef.current.scrollTo({
					top: containerRef.current.scrollHeight,
					behavior: "smooth",
				});
			}
		}
		prevMessageCountRef.current = props.messageCount;
	}, [props.messageCount]);

	useEffect(() => {
		if (!containerRef.current) return;
		function callback() {
			const container = containerRef.current;
			if (!container) return;

			// Only auto-scroll if user hasn't manually scrolled up
			if (!isUserScrollingRef.current) {
				container.scrollTo({
					top: container.scrollHeight,
					behavior: "instant",
				});
			}
		}

		const observer = new ResizeObserver(callback);
		callback();

		const element = containerRef.current?.firstElementChild;

		if (element) {
			observer.observe(element);
		}

		return () => {
			observer.disconnect();
		};
	}, []);

	// Track when user manually scrolls
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;

			// If user is near bottom, enable auto-scroll, otherwise disable it
			isUserScrollingRef.current = !isNearBottom;
		};

		container.addEventListener("scroll", handleScroll);
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	const { messageCount, ...divProps } = props;

	return (
		<div
			ref={containerRef}
			{...divProps}
			className={cn(
				"fd-scroll-container overflow-y-auto min-w-0 flex flex-col",
				props.className,
			)}
		>
			{props.children}
		</div>
	);
}

function Input(props: ComponentProps<"textarea">) {
	const ref = useRef<HTMLDivElement>(null);
	const shared = cn("col-start-1 row-start-1", props.className);

	return (
		<div className="grid flex-1">
			<textarea
				id="nd-ai-input"
				{...props}
				className={cn(
					"bg-transparent resize-none placeholder:text-fd-muted-foreground focus-visible:outline-none",
					shared,
				)}
			/>
			<div ref={ref} className={cn(shared, "invisible break-all")}>
				{`${props.value?.toString() ?? ""}\n`}
			</div>
		</div>
	);
}

const roleName: Record<string, string> = {
	user: "you",
	assistant: "BA bot",
};

function ThinkingIndicator() {
	return (
		<div className="flex flex-col">
			<p className="mb-1 text-sm font-medium text-fd-muted-foreground">
				BA bot
			</p>
			<div className="flex gap-1 items-end text-sm text-fd-muted-foreground">
				<div className="flex gap-1 items-center opacity-70">
					<span className="inline-block size-1 bg-fd-primary rounded-full animate-bounce [animation-delay:0ms]" />
					<span className="inline-block size-1 opacity-80 bg-fd-primary rounded-full animate-bounce [animation-delay:150ms]" />
					<span className="inline-block size-1 bg-fd-primary rounded-full animate-bounce [animation-delay:300ms]" />
				</div>
			</div>
		</div>
	);
}

function Message({
	message,
	messages,
	messageIndex,
	isStreaming,
	...props
}: {
	message: UIMessage;
	messages?: UIMessage[];
	messageIndex?: number;
	isStreaming?: boolean;
} & ComponentProps<"div">) {
	let markdown = "";
	let links: z.infer<typeof ProvideLinksToolSchema>["links"] = [];

	for (const part of message.parts ?? []) {
		if (part.type === "text") {
			const textWithCitations = part.text.replace(/\((\d+)\)/g, "");
			markdown += textWithCitations;
			continue;
		}

		if (part.type === "tool-provideLinks" && part.input) {
			links = (part.input as z.infer<typeof ProvideLinksToolSchema>).links;
		}
	}

	// Fix incomplete code blocks for better rendering during streaming
	const codeBlockCount = (markdown.match(/```/g) || []).length;
	if (codeBlockCount % 2 !== 0) {
		// Odd number of ``` means there's an unclosed code block
		markdown += "\n```";
	}

	// Ensure proper spacing around code blocks
	markdown = markdown
		.replace(/```(\w+)?\n/g, "\n```$1\n")
		.replace(/\n```\n/g, "\n```\n\n");

	return (
		<div {...props}>
			<p
				className={cn(
					"mb-1 text-sm font-medium text-fd-muted-foreground",
					message.role === "assistant" && "text-fd-primary",
				)}
			>
				{roleName[message.role] ?? "unknown"}
			</p>
			<div className="text-sm prose">
				<Markdown text={markdown} />
			</div>
			{links && links.length > 0 && (
				<div className="flex flex-col gap-2 mt-3">
					<p className="text-xs font-medium text-fd-muted-foreground">
						References:
					</p>
					<div className="flex flex-col gap-1">
						{links.map((item, i) => (
							<Link
								key={i}
								href={item.url}
								className="flex gap-2 items-center p-2 text-xs rounded-lg border transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
								target="_blank"
								rel="noopener noreferrer"
							>
								<span className="truncate">{item.title || item.label}</span>
							</Link>
						))}
					</div>
				</div>
			)}
			{message.role === "assistant" && message.id && !isStreaming && (
				<MessageFeedback
					messageId={message.id}
					userMessageId={
						messages && messageIndex !== undefined && messageIndex > 0
							? messages[messageIndex - 1]?.id
							: undefined
					}
					content={markdown}
					className="opacity-100 transition-opacity"
				/>
			)}
		</div>
	);
}
// const InKeepLogo = (props: SVGProps<any>) => {
// 	return (
// 		<svg
// 			className={props.className}
// 			width="2rem"
// 			height="2rem"
// 			viewBox="0 0 897 175"
// 			fill="currentColor"
// 			xmlns="http://www.w3.org/2000/svg"
// 		>
// 			<path
// 				d="M10.7678 81.0084C10.0534 79.7709 10.0537 78.2461 10.768 77.0086L46.6654 14.8312C47.3799 13.5938 48.7006 12.8314 50.1295 12.8312L121.925 12.8318C123.354 12.8319 124.675 13.594 125.389 14.8316L161.287 77.0078C162.001 78.2454 162.002 79.7709 161.287 81.0085L125.389 143.185C124.675 144.422 123.354 145.185 121.925 145.185L50.1298 145.185C48.7007 145.185 47.3798 144.422 46.6653 143.185L10.7678 81.0084ZM38.005 148.185C40.5059 152.516 45.1281 155.185 50.1297 155.185L121.925 155.185C126.927 155.185 131.549 152.516 134.049 148.185L169.947 86.0084C172.448 81.6768 172.448 76.3394 169.947 72.0078L134.05 9.8316C131.549 5.50004 126.927 2.83196 121.925 2.83189L50.1295 2.83131C45.128 2.83143 40.506 5.49981 38.0052 9.83131L2.10775 72.0086C-0.392861 76.3402 -0.393192 81.6769 2.10758 86.0084L38.005 148.185Z"
// 				fill="currentColor"
// 			/>
// 			<path
// 				d="M97.4628 113.697C80.91 88.4351 86.665 52.1106 111.925 34.1427L111.931 34.1388C122.704 26.4965 136.454 16.3423 151.082 9.16902C165.646 2.02694 181.956 -2.61365 197.791 1.7364L197.792 1.73542C203.599 3.22962 208.168 5.26954 211.8 8.12898C215.476 11.0241 217.894 14.5262 219.731 18.4678C221.515 22.2962 222.814 26.6945 224.158 31.3585C225.529 36.1177 227.006 41.3803 229.174 47.4141C230.371 50.747 232.778 54.4086 235.929 59.3302C238.935 64.0265 242.394 69.5657 244.829 75.9512C247.292 82.4111 248.729 89.7772 247.749 98.2022C246.772 106.606 243.425 115.763 236.765 125.876C232.346 132.586 223.573 139.318 214.181 144.73C204.656 150.217 193.716 154.789 184.313 156.809L184.307 156.81L184.299 156.812C163.919 161.121 147.298 158.432 133.07 150.322C119.023 142.315 107.752 129.273 97.4726 113.712L97.4677 113.704L97.4628 113.697ZM117.6 42.1319C96.8344 56.9074 91.8642 87.2556 105.649 108.312L105.65 108.311C115.598 123.368 125.84 134.921 137.924 141.809C149.824 148.591 163.947 151.096 182.256 147.227L183.026 147.056C191.04 145.216 200.675 141.199 209.288 136.237C218.311 131.039 225.449 125.239 228.58 120.485C234.568 111.392 237.247 103.673 238.015 97.0704C238.78 90.4888 237.683 84.7163 235.672 79.4425C233.633 74.0943 230.679 69.3045 227.676 64.6134C224.817 60.1475 221.616 55.3629 219.951 50.7276C217.657 44.3415 216.092 38.7622 214.741 34.0723C213.362 29.2875 212.257 25.6292 210.849 22.6075C209.493 19.699 207.931 17.5565 205.736 15.8282C203.496 14.0643 200.302 12.5011 195.35 11.2266L195.307 11.2159L195.264 11.2032C182.837 7.76335 169.185 11.2077 155.397 17.9688C141.647 24.7118 128.64 34.3005 117.601 42.1319L117.6 42.1319Z"
// 				fill="currentColor"
// 			/>
// 			<path d="M289 25.2163H302.391V133.916H289V25.2163Z" />
// 			<path
// 				d="M321.323 25.2165H334.715V45.0725C340.533 34.6366 358.634 23 378.398 23C385.601 23 392.713 24.0159 398.254 26.14C403.703 28.2642 408.413 31.4042 412.199 35.5601C415.986 39.716 418.849 44.9802 420.88 51.3525C422.82 57.6326 423.836 64.9285 423.836 73.148V133.917H410.444V74.6256C410.444 67.9762 409.706 62.2503 408.228 57.3555C406.75 52.4608 404.534 48.3972 401.671 45.0725C398.808 41.7478 395.206 39.3466 390.865 37.7766C386.617 36.2066 381.722 35.4677 376.181 35.4677C369.809 35.4677 364.083 36.3913 359.004 38.3307C353.924 40.2701 349.583 42.9484 345.982 46.4578C342.38 49.9672 339.609 54.1232 337.762 58.8332C335.823 63.5432 334.899 68.8997 334.899 74.718V134.009H321.508V25.2165H321.323Z"
// 				fill="currentColor"
// 			/>
// 			<path
// 				d="M542.475 56.6167C545.245 49.6902 549.032 43.6872 553.927 38.6078C558.821 33.6207 564.64 29.7418 571.381 27.0636C578.123 24.3853 585.604 23 593.731 23C601.858 23 609.246 24.3853 615.988 27.1559C622.73 29.9265 628.548 33.8054 633.443 38.7001C638.43 43.6872 642.217 49.5978 644.895 56.6167C647.573 63.6356 648.958 71.3933 648.958 79.8898V84.1381H549.771V72.3168H638.523L635.66 79.7975C635.66 73.148 634.644 67.0527 632.52 61.6038C630.395 56.1549 627.532 51.4449 623.931 47.4737C620.237 43.5025 615.896 40.5472 610.724 38.423C605.552 36.2989 599.919 35.283 593.823 35.283C587.728 35.283 581.91 36.3913 576.738 38.5154C571.566 40.6395 567.133 43.6872 563.439 47.5661C559.745 51.4449 556.79 56.0626 554.665 61.5114C552.541 66.9603 551.525 72.8709 551.525 79.428C551.525 85.9851 552.634 92.0805 554.758 97.5293C556.882 102.978 559.93 107.596 563.716 111.475C567.503 115.354 572.028 118.309 577.2 120.525C582.372 122.65 588.097 123.758 594.378 123.758C604.167 123.758 612.479 121.264 619.405 116.369C626.332 111.475 631.227 104.548 634.274 95.7746L647.296 100.208C643.51 111.29 636.953 120.064 627.81 126.528C618.574 132.993 607.584 136.226 594.655 136.226C586.435 136.226 578.77 134.84 571.936 132.162C565.009 129.484 559.098 125.605 554.111 120.618C549.124 115.631 545.245 109.628 542.475 102.701C539.704 95.7746 538.227 88.1093 538.227 79.5204C538.227 70.9315 539.612 63.6356 542.382 56.6167H542.475Z"
// 				fill="currentColor"
// 			/>
// 			<path
// 				d="M664.383 56.6167C667.154 49.6902 670.94 43.6872 675.835 38.6078C680.73 33.5283 686.548 29.7418 693.29 27.0636C700.032 24.3853 707.512 23 715.639 23C723.766 23 731.155 24.3853 737.896 27.1559C744.638 29.9265 750.457 33.8054 755.351 38.7001C760.338 43.6872 764.125 49.5978 766.803 56.6167C769.481 63.6356 770.867 71.3933 770.867 79.8898V84.1381H671.679V72.3168H760.431L757.568 79.7975C757.568 73.148 756.552 67.0527 754.428 61.6038C752.304 56.1549 749.441 51.4449 745.747 47.4737C742.052 43.5025 737.712 40.5472 732.54 38.423C727.368 36.2989 721.735 35.283 715.639 35.283C709.544 35.283 703.726 36.3913 698.554 38.5154C693.382 40.6395 688.949 43.6872 685.255 47.5661C681.561 51.4449 678.605 56.0626 676.481 61.5114C674.357 66.9603 673.341 72.8709 673.341 79.428C673.341 85.9851 674.45 92.0805 676.574 97.5293C678.698 102.978 681.746 107.596 685.532 111.475C689.318 115.354 693.844 118.309 699.016 120.525C704.187 122.65 709.913 123.758 716.193 123.758C725.983 123.758 734.295 121.264 741.221 116.369C748.148 111.475 753.042 104.548 756.09 95.7746L769.112 100.208C765.325 111.29 758.861 120.064 749.625 126.528C740.39 132.993 729.4 136.226 716.47 136.226C708.251 136.226 700.586 134.84 693.751 132.162C686.825 129.484 680.914 125.605 676.02 120.618C671.032 115.631 667.154 109.628 664.383 102.701C661.52 95.7746 660.135 88.1093 660.135 79.5204C660.135 70.9315 661.52 63.6356 664.291 56.6167H664.383Z"
// 				fill="currentColor"
// 			/>
// 			<path
// 				d="M785.371 25.2165H798.762V49.7825C803.288 41.7478 808.829 36.1142 816.864 30.8501C824.806 25.6783 834.226 23 845.124 23C852.882 23 859.808 24.293 866.18 26.9712C872.461 29.6495 877.817 33.3436 882.25 38.146C886.683 42.9484 890.008 48.859 892.409 55.8779C894.81 62.8967 896.011 70.8392 896.011 79.6127C896.011 88.3863 894.81 96.3287 892.409 103.255C890.008 110.274 886.683 116.185 882.25 120.987C877.817 125.882 872.553 129.576 866.273 132.162C860.085 134.748 853.066 136.041 845.309 136.041C834.503 136.041 824.991 133.363 816.956 128.098C808.921 122.834 803.288 116.185 798.762 109.258V174.368H785.371V25.2165ZM801.995 97.7141C804.119 103.163 807.167 107.873 811.045 111.752C814.924 115.631 819.542 118.586 824.991 120.71C830.44 122.834 836.258 123.85 842.446 123.85C848.633 123.85 854.082 122.834 859.069 120.895C864.056 118.955 868.305 116.092 871.814 112.214C875.324 108.335 877.909 103.809 879.849 98.3605C881.788 92.9117 882.712 86.8163 882.712 79.8898C882.712 72.9633 881.696 66.5909 879.756 61.0497C877.817 55.6008 875.046 50.8908 871.629 47.0119C868.212 43.1331 863.964 40.2701 858.885 38.2383C853.897 36.2989 848.356 35.283 842.261 35.283C836.166 35.283 830.07 36.2989 824.806 38.423C819.542 40.5472 814.924 43.5025 811.045 47.3813C807.167 51.2602 804.211 55.8779 801.995 61.3267C799.778 66.7756 798.762 72.8709 798.762 79.6127C798.762 86.3546 799.871 92.0805 801.995 97.6217V97.7141Z"
// 				fill="currentColor"
// 			/>
// 			<path
// 				d="M541.309 23H521.73L453.204 83.6763V23H440.274V133.917H453.204V100.669L453.389 100.854L476.754 80.1669L528.195 133.917H546.666L486.451 71.578L541.309 23Z"
// 				fill="currentColor"
// 			/>
// 		</svg>
// 	);
// };

export function AISearchTrigger() {
	const [open, setOpen] = useState(false);
	const [contentVisible, setContentVisible] = useState(false);
	const isMobile = useIsMobile();
	const chat = useChat({
		id: "search",
		transport: new DefaultChatTransport({
			api: "/api/chat",
		}),
	});

	const showSuggestions =
		chat.messages.length === 0 && chat.status !== "streaming";

	const onKeyPress = (e: KeyboardEvent) => {
		if (e.key === "Escape" && open) {
			setOpen(false);
			e.preventDefault();
		}

		if (e.key === "/" && (e.metaKey || e.ctrlKey) && !open) {
			setOpen(true);
			e.preventDefault();
		}
	};

	const onKeyPressRef = useRef(onKeyPress);
	onKeyPressRef.current = onKeyPress;
	useEffect(() => {
		const listener = (e: KeyboardEvent) => onKeyPressRef.current(e);
		window.addEventListener("keydown", listener);
		return () => window.removeEventListener("keydown", listener);
	}, []);

	// Delay showing content for smooth transition
	useEffect(() => {
		if (open) {
			const timer = setTimeout(() => {
				setContentVisible(true);
			}, 100);
			return () => clearTimeout(timer);
		} else {
			setContentVisible(false);
		}
	}, [open]);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const aiQuery = params.get("askai");

		if (aiQuery) {
			setOpen(true);
			// Send the message to AI
			void chat.sendMessage({ text: decodeURIComponent(aiQuery) });

			// Clean up the URL by removing the askai parameter
			const newParams = new URLSearchParams(window.location.search);
			newParams.delete("askai");
			const newUrl = newParams.toString()
				? `${window.location.pathname}?${newParams.toString()}`
				: window.location.pathname;
			window.history.replaceState({}, "", newUrl);
		}
	}, []);

	return (
		<Context value={useMemo(() => ({ chat, open, setOpen }), [chat, open])}>
			<RemoveScroll enabled={open}>
				<Presence present={open}>
					<div
						className={cn(
							"fixed inset-0 flex flex-col items-center bg-fd-background/80 backdrop-blur-sm z-30",
							isMobile
								? "p-4 pb-40"
								: "p-2 right-(--removed-body-scroll-bar-size,0) pb-[8.375rem]",
							open ? "animate-fd-fade-in" : "animate-fd-fade-out",
						)}
						onClick={(e) => {
							if (e.target === e.currentTarget) {
								setOpen(false);
								e.preventDefault();
							}
						}}
					>
						<div
							className={cn(
								"flex sticky top-0 gap-2 items-center py-2",
								isMobile ? "w-full" : "w-[min(800px,90vw)]",
							)}
						>
							<div className="flex justify-end items-center w-full">
								<button
									aria-label="Close"
									tabIndex={-1}
									className={cn(
										buttonVariants({
											size: isMobile ? "icon" : "icon-sm",
											color: "secondary",
											className: "rounded-full",
										}),
									)}
									onClick={() => setOpen(false)}
								>
									<X />
								</button>
							</div>
						</div>
						<List
							messageCount={chat.messages.length}
							className={cn(
								"overscroll-contain flex-1",
								isMobile
									? "px-2 pt-6 pb-28 w-full"
									: "py-10 pr-2 w-[min(800px,90vw)]",
							)}
							style={{
								maskImage: isMobile
									? "linear-gradient(to bottom, transparent, white 2rem, white calc(100% - 12rem), transparent 100%)"
									: "linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 2rem), transparent 100%)",
							}}
						>
							<div className="flex flex-col gap-4">
								{chat.messages
									.filter((msg: UIMessage) => msg.role !== "system")
									.map((item: UIMessage, index: number) => {
										const filteredMessages = chat.messages.filter(
											(msg: UIMessage) => msg.role !== "system",
										);
										const isLastMessage = index === filteredMessages.length - 1;
										const isCurrentlyStreaming =
											(chat.status === "streaming" ||
												chat.status === "submitted") &&
											item.role === "assistant" &&
											isLastMessage;

										return (
											<Message
												key={item.id}
												message={item}
												messages={filteredMessages}
												messageIndex={index}
												isStreaming={isCurrentlyStreaming}
											/>
										);
									})}
								{chat.status === "submitted" && <ThinkingIndicator />}
							</div>
						</List>
					</div>
				</Presence>
				<div
					className={cn(
						"fixed bg-transparent transition-[width,height] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] -translate-x-1/2 shadow-md z-30 border",
						isMobile ? "bottom-4" : "bottom-4",
						open
							? isMobile
								? `w-[calc(100vw-2rem)] bg-fd-accent/30 overflow-visible h-auto`
								: `w-[min(800px,90vw)] bg-fd-accent/30 overflow-visible h-auto`
							: "w-26 h-10 bg-fd-secondary/80 backdrop-blur-sm text-fd-secondary-foreground shadow-fd-background rounded-2xl overflow-hidden active:scale-97 hover:scale-103 transition-transform",
					)}
					style={{
						left: open
							? "calc(50% - var(--removed-body-scroll-bar-size,0px)/2)"
							: "",
						right: open ? "" : "-35px",
					}}
				>
					{!open && (
						<button
							className={cn(
								"absolute inset-0 flex items-center justify-between px-3 py-4 transition-colors text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground rounded-none text-sm",
							)}
							onClick={() => setOpen(true)}
						>
							<div className="flex items-center gap-2 flex-1 justify-center mr-2">
								<Bot className={cn("size-4")} />
								<span>Ask AI</span>
							</div>
						</button>
					)}
					{open && (
						<div
							className={cn(
								"flex flex-col transition-all duration-100",
								contentVisible ? "opacity-100 blur-0" : "opacity-50 blur-md",
							)}
						>
							<SearchAIInput isMobile={isMobile} />
						</div>
					)}
				</div>
			</RemoveScroll>
		</Context>
	);
}
