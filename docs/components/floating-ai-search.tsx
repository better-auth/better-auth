"use client";
import { type UIMessage, type UseChatHelpers, useChat } from "@ai-sdk/react";
import { Presence } from "@radix-ui/react-presence";
import { DefaultChatTransport } from "ai";
import Link from "fumadocs-core/link";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { Loader2, RefreshCw, SearchIcon, Send, X } from "lucide-react";
import {
	type ComponentProps,
	createContext,
	type SyntheticEvent,
	use,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { RemoveScroll } from "react-remove-scroll";
import type { z } from "zod";
import type { ProvideLinksToolSchema } from "@/lib/chat/inkeep-qa-schema";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

const Context = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
	chat: UseChatHelpers<UIMessage>;
} | null>(null);

function useChatContext() {
	return use(Context)!.chat;
}

function SearchAIActions() {
	const { messages, status, setMessages, stop } = useChatContext();
	const isGenerating = status === "streaming" || status === "submitted";

	if (messages.length === 0) return null;

	return (
		<>
			{!isLoading && messages.at(-1)?.role === "assistant" && (
				<button
					type="button"
					className={cn(
						buttonVariants({
							color: "secondary",
							size: "sm",
							className: "rounded-full gap-1.5",
						}),
					)}
					onClick={() => regenerate()}
				>
					<RefreshCw className="size-4" />
					Retry
				</button>
			)}
			<button
				type="button"
				className={cn(
					buttonVariants({
						color: "secondary",
						size: "sm",
						className: "rounded-none",
					}),
				)}
				onClick={isGenerating ? stop : () => setMessages([])}
			>
				{isGenerating ? "Cancel" : "Clear Chat"}
			</button>
		</>
	);
}

const suggestions = [
	"How to configure Sqlite database?",
	"How to require email verification?",
	"How to change session expiry?",
	"How to share cookies across subdomains?",
];

function SearchAIInput(props: ComponentProps<"form">) {
	const { status, sendMessage, stop, messages } = useChatContext();
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

	useEffect(() => {
		if (isLoading) document.getElementById("nd-ai-input")?.focus();
	}, [isLoading]);

	return (
		<div className={cn("flex flex-col", isLoading ? "opacity-50" : "")}>
			<form
				{...props}
				className={cn("flex items-start pe-2", props.className)}
				onSubmit={onStart}
			>
				<Input
					value={input}
					placeholder={isLoading ? "answering..." : "Ask BA bot"}
					autoFocus
					className="p-4"
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
								className: "transition-all rounded-full mt-2 gap-2",
							}),
						)}
						onClick={stop}
					>
						<Loader2 className="size-4 animate-spin text-fd-muted-foreground" />
					</button>
				) : (
					<button
						key="bn"
						type="submit"
						className={cn(
							buttonVariants({
								color: "secondary",
								className: "transition-all rounded-full mt-2",
							}),
						)}
						disabled={input.length === 0}
					>
						<Send className="size-4" />
					</button>
				)}
			</form>

			{showSuggestions && (
				<div className="mt-3 px-4">
					<p className="text-xs font-medium text-fd-muted-foreground mb-2">
						Try asking:
					</p>
					<div className="flex flex-wrap gap-2">
						{suggestions.slice(0, 4).map((suggestion, i) => (
							<button
								key={i}
								onClick={() => handleSuggestionClick(suggestion)}
								className="text-xs px-3 py-1.5 bg-fd-muted/30 hover:bg-fd-muted/50 text-fd-muted-foreground hover:text-fd-foreground rounded-full border border-fd-border/50 hover:border-fd-border transition-all duration-200 text-left"
							>
								{suggestion}
							</button>
						))}
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

	return (
		<div
			ref={containerRef}
			{...props}
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
					"resize-none bg-transparent placeholder:text-fd-muted-foreground focus-visible:outline-none",
					shared,
				)}
			/>
			<div ref={ref} className={cn(shared, "break-all invisible")}>
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
			<div className="flex items-end gap-1 text-sm text-fd-muted-foreground">
				<span>Thinking</span>
				<div className="flex items-center gap-1 opacity-70">
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
	...props
}: { message: UIMessage } & ComponentProps<"div">) {
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
			<div className="prose text-sm">
				<Markdown text={markdown} />
			</div>
			{links && links.length > 0 && (
				<div className="mt-3 flex flex-col gap-2">
					<p className="text-xs font-medium text-fd-muted-foreground">
						References:
					</p>
					<div className="flex flex-col gap-1">
						{links.map((item, i) => (
							<Link
								key={i}
								href={item.url}
								className="flex items-center gap-2 text-xs rounded-lg border p-2 hover:bg-fd-accent hover:text-fd-accent-foreground transition-colors"
								target="_blank"
								rel="noopener noreferrer"
							>
								<span className="truncate">{item.title || item.label}</span>
							</Link>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export function AISearchTrigger() {
	const [open, setOpen] = useState(false);
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

	return (
		<Context value={useMemo(() => ({ chat, open, setOpen }), [chat, open])}>
			<RemoveScroll enabled={open}>
				<Presence present={open}>
					<div
						className={cn(
							"fixed inset-0 p-2 right-(--removed-body-scroll-bar-size,0) flex flex-col pb-[8.375rem] items-center bg-fd-background/80 backdrop-blur-sm z-30",
							open ? "animate-fd-fade-in" : "animate-fd-fade-out",
						)}
						onClick={(e) => {
							if (e.target === e.currentTarget) {
								setOpen(false);
								e.preventDefault();
							}
						}}
					>
						<div className="sticky top-0 flex gap-2 items-center py-2 w-[min(800px,90vw)]">
							<button
								aria-label="Close"
								tabIndex={-1}
								className={cn(
									buttonVariants({
										size: "icon-sm",
										color: "secondary",
										className: "rounded-full ml-auto",
									}),
								)}
								onClick={() => setOpen(false)}
							>
								<X />
							</button>
						</div>
						<List
							messageCount={chat.messages.length}
							className="py-10 pr-2 w-[min(800px,90vw)] overscroll-contain"
							style={{
								maskImage:
									"linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 2rem), transparent 100%)",
							}}
						>
							<div className="flex flex-col gap-4">
								{chat.messages
									.filter((msg: UIMessage) => msg.role !== "system")
									.map((item: UIMessage) => (
										<Message key={item.id} message={item} />
									))}
								{chat.status === "submitted" && <ThinkingIndicator />}
							</div>
						</List>
					</div>
				</Presence>
				<div
					className={cn(
						"fixed bottom-2 transition-[width,height] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] -translate-x-1/2 rounded-sm border shadow-xl overflow-hidden z-30",
						open
							? `w-[min(800px,90vw)] bg-fd-popover ${showSuggestions ? "h-48" : "h-32"}`
							: "w-40 h-10 bg-fd-secondary text-fd-secondary-foreground shadow-fd-background rounded-2xl",
					)}
					style={{
						left: "calc(50% - var(--removed-body-scroll-bar-size,0px)/2)",
					}}
				>
					<Presence present={!open}>
						<button
							className={cn(
								"absolute inset-0 text-center p-2  text-fd-muted-foreground text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground",
								!open
									? "animate-fd-fade-in"
									: "animate-fd-fade-out bg-fd-accent",
							)}
							onClick={() => setOpen(true)}
						>
							<SearchIcon className="absolute top-1/2 -translate-y-1/2 size-4.5" />
							Ask AI
						</button>
					</Presence>
					<Presence present={open}>
						<div
							className={cn(
								"absolute inset-0 flex flex-col",
								open ? "animate-fd-fade-in" : "animate-fd-fade-out",
							)}
						>
							<SearchAIInput className="flex-1" />
							<div className="flex items-center gap-1.5 p-2 empty:hidden">
								<SearchAIActions />
							</div>
						</div>
					</Presence>
				</div>
			</RemoveScroll>
		</Context>
	);
}
