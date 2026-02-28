"use client";

import type { UIMessage } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { useDocsSearch } from "fumadocs-core/search/client";
import {
	ArrowUp,
	FileText,
	Hash,
	Loader2,
	Search,
	Sparkles,
	Text,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentProps, SyntheticEvent } from "react";
import {
	createContext,
	use,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { MessageFeedback } from "./message-feedback";

// ─── Context ─────────────────────────────────────────────────────────────────

type CommandMenuContextValue = {
	open: boolean;
	setOpen: (open: boolean) => void;
	openAI: () => void;
};

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

export function useCommandMenu() {
	const ctx = use(CommandMenuContext);
	if (!ctx)
		throw new Error("useCommandMenu must be used within CommandMenuProvider");
	return ctx;
}

// ─── AI Suggestions ──────────────────────────────────────────────────────────

const suggestions = [
	"How to configure Sqlite database?",
	"How to require email verification?",
	"How to change session expiry?",
	"How to share cookies across subdomains?",
];

// ─── Provider ────────────────────────────────────────────────────────────────

const initialModeRef = { current: "search" as Mode };

export function CommandMenuProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	const openAI = useCallback(() => {
		initialModeRef.current = "ai";
		setOpen(true);
	}, []);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((prev) => !prev);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	// Support ?askai= URL param
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const aiQuery = params.get("askai");
		if (aiQuery) {
			setOpen(true);
			// Clean up URL
			const newParams = new URLSearchParams(window.location.search);
			newParams.delete("askai");
			const newUrl = newParams.toString()
				? `${window.location.pathname}?${newParams.toString()}`
				: window.location.pathname;
			window.history.replaceState({}, "", newUrl);
		}
	}, []);

	const value = useMemo(() => ({ open, setOpen, openAI }), [open, openAI]);

	return (
		<CommandMenuContext value={value}>
			{children}
			<CommandMenuDialog />
		</CommandMenuContext>
	);
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

type Mode = "search" | "ai";

function CommandMenuDialog() {
	const { open, setOpen } = useCommandMenu();
	const [mode, setMode] = useState<Mode>("search");
	const [searchQuery, setSearchQuery] = useState("");

	// Pick up initial mode when opening
	useEffect(() => {
		if (open && initialModeRef.current !== "search") {
			setMode(initialModeRef.current);
			initialModeRef.current = "search";
		}
	}, [open]);

	const chat = useChat({
		id: "command-menu-ai",
		transport: new DefaultChatTransport({ api: "/api/docs/chat" }),
	});

	// Handle initial ?askai= param
	const initialAiQueryHandled = useRef(false);
	useEffect(() => {
		if (open && !initialAiQueryHandled.current) {
			const params = new URLSearchParams(window.location.search);
			const aiQuery = params.get("askai");
			if (aiQuery) {
				setMode("ai");
				void chat.sendMessage({ text: decodeURIComponent(aiQuery) });
				initialAiQueryHandled.current = true;
			}
		}
	}, [open]);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (!next) {
				// Reset state on close
				setTimeout(() => {
					setMode("search");
					setSearchQuery("");
					chat.setMessages([]);
				}, 200);
			}
		},
		[setOpen, chat],
	);

	const handleTabToggle = useCallback(() => {
		setMode((prev) => (prev === "search" ? "ai" : "search"));
	}, []);

	return (
		<AnimatePresence>
			{open && (
				<>
					{/* Overlay */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.15 }}
						className="fixed inset-0 z-[200] bg-black/50"
						onClick={() => handleOpenChange(false)}
						onKeyDown={(e) => {
							if (e.key === "Escape") handleOpenChange(false);
						}}
					/>

					{/* Dialog */}
					<motion.div
						initial={{ opacity: 0, scale: 0.96, y: -8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.96, y: -8 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="fixed left-[50%] top-[20%] z-[201] translate-x-[-50%] w-full max-w-[640px] px-4 sm:px-0"
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								e.stopPropagation();
								handleOpenChange(false);
							}
							if (e.key === "Tab" && !e.shiftKey) {
								e.preventDefault();
								handleTabToggle();
							}
						}}
					>
						<div className="border border-foreground/[0.08] bg-background shadow-2xl font-mono overflow-hidden flex flex-col max-h-[min(500px,60vh)]">
							{mode === "search" ? (
								<SearchMode
									query={searchQuery}
									setQuery={setSearchQuery}
									onClose={() => handleOpenChange(false)}
									onTabToggle={handleTabToggle}
								/>
							) : (
								<AIMode
									chat={chat}
									onClose={() => handleOpenChange(false)}
									onTabToggle={handleTabToggle}
								/>
							)}
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

// ─── Search Mode ─────────────────────────────────────────────────────────────

function SearchMode({
	query,
	setQuery,
	onClose,
	onTabToggle,
}: {
	query: string;
	setQuery: (q: string) => void;
	onClose: () => void;
	onTabToggle: () => void;
}) {
	const {
		search: _search,
		setSearch,
		query: results,
	} = useDocsSearch({
		type: "fetch",
		api: "/api/docs/search",
	});
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Sync external query with search
	useEffect(() => {
		setSearch(query);
	}, [query, setSearch]);

	// Auto-focus
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	const items = results.data !== "empty" ? (results.data ?? []) : [];

	// Reset selection when results change
	useEffect(() => {
		setSelectedIndex(0);
	}, [items.length]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1));
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			setSelectedIndex((prev) => Math.max(prev - 1, 0));
		} else if (e.key === "Enter" && items[selectedIndex]) {
			e.preventDefault();
			router.push(items[selectedIndex].url);
			onClose();
		} else if (e.key === "Tab" && !e.shiftKey) {
			e.preventDefault();
			e.stopPropagation();
			onTabToggle();
		}
	};

	return (
		<>
			{/* Input */}
			<div className="flex items-center border-b border-foreground/[0.06] px-3">
				<Search className="mr-2 size-4 shrink-0 text-muted-foreground" />
				<input
					ref={inputRef}
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Search documentation..."
					className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground font-mono"
				/>
				<button
					type="button"
					onClick={onTabToggle}
					className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 border border-foreground/[0.08]"
				>
					<Sparkles className="size-3" />
					<kbd className="text-[9px] ml-1 opacity-60">Tab</kbd>
				</button>
			</div>

			{/* Results */}
			<div className="overflow-y-auto flex-1 p-1">
				{results.isLoading && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						Searching...
					</div>
				)}
				{!results.isLoading && query && items.length === 0 && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						No results found.
					</div>
				)}
				{!results.isLoading && !query && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						Type to search documentation...
					</div>
				)}
				{items.map((item, index) => {
					const isNested = item.type === "heading" || item.type === "text";
					const pageName = (item as any).pageName as string | undefined;
					return (
						<button
							key={item.id}
							type="button"
							className={cn(
								"group flex w-full items-center gap-2 px-2 py-1.5 text-sm text-left transition-colors",
								isNested && "pl-5",
								index === selectedIndex
									? "bg-foreground/[0.04] text-foreground"
									: "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
							)}
							onClick={() => {
								router.push(item.url);
								onClose();
							}}
							onMouseEnter={() => setSelectedIndex(index)}
						>
							{item.type === "heading" ? (
								<Hash className="size-3.5 shrink-0 opacity-50" />
							) : item.type === "text" ? (
								<Text className="size-3.5 shrink-0 opacity-50" />
							) : (
								<FileText className="size-4 shrink-0" />
							)}
							<span className="truncate">
								{item.content}
								{isNested && pageName && (
									<span
										className={cn(
											"ml-1.5 transition-colors",
											index === selectedIndex
												? "text-foreground/80"
												: "text-muted-foreground/60 group-hover:text-foreground/80",
										)}
									>
										in {pageName}
									</span>
								)}
							</span>
						</button>
					);
				})}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between border-t border-foreground/[0.06] px-3 py-1.5 text-[10px] text-muted-foreground">
				<div className="flex gap-2">
					<span>
						<kbd className="px-1 py-0.5 border border-foreground/[0.08]">
							↑↓
						</kbd>{" "}
						navigate
					</span>
					<span>
						<kbd className="px-1 py-0.5 border border-foreground/[0.08]">↵</kbd>{" "}
						open
					</span>
					<span>
						<kbd className="px-1 py-0.5 border border-foreground/[0.08]">
							esc
						</kbd>{" "}
						close
					</span>
				</div>
			</div>
		</>
	);
}

// ─── AI Mode ─────────────────────────────────────────────────────────────────

function AIMode({
	chat,
	onClose,
	onTabToggle,
}: {
	chat: ReturnType<typeof useChat>;
	onClose: () => void;
	onTabToggle: () => void;
}) {
	const { messages, status, sendMessage, stop, setMessages } = chat;
	const [input, setInput] = useState("");
	const isLoading = status === "streaming" || status === "submitted";
	const showSuggestions = messages.length === 0 && !isLoading;
	const listRef = useRef<HTMLDivElement>(null);
	const isUserScrollingRef = useRef(false);
	const prevMessageCountRef = useRef(messages.length);

	const onStart = (e?: SyntheticEvent) => {
		e?.preventDefault();
		if (!input.trim() || isLoading) return;
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

	// Scroll to bottom on new messages
	useEffect(() => {
		if (messages.length > prevMessageCountRef.current) {
			isUserScrollingRef.current = false;
			listRef.current?.scrollTo({
				top: listRef.current.scrollHeight,
				behavior: "smooth",
			});
		}
		prevMessageCountRef.current = messages.length;
	}, [messages.length]);

	// Auto-scroll on content changes
	useEffect(() => {
		if (!listRef.current) return;
		const container = listRef.current;

		function callback() {
			if (!container || isUserScrollingRef.current) return;
			container.scrollTo({
				top: container.scrollHeight,
				behavior: "instant",
			});
		}

		const observer = new ResizeObserver(callback);
		const element = container.firstElementChild;
		if (element) observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// Track user scroll
	useEffect(() => {
		const container = listRef.current;
		if (!container) return;

		const handleScroll = () => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			isUserScrollingRef.current =
				scrollHeight - scrollTop - clientHeight >= 50;
		};

		container.addEventListener("scroll", handleScroll, { passive: true });
		return () => container.removeEventListener("scroll", handleScroll);
	}, []);

	return (
		<>
			{/* Input */}
			<div className="flex items-center border-b border-foreground/[0.06] px-3">
				<Sparkles className="mr-2 size-4 shrink-0 text-muted-foreground" />
				<form onSubmit={onStart} className="flex flex-1 items-center gap-2">
					<AITextInput
						value={input}
						onChange={setInput}
						onSubmit={onStart}
						disabled={isLoading}
						placeholder={isLoading ? "Answering..." : "Ask BA Bot..."}
					/>
					{isLoading ? (
						<button
							type="button"
							onClick={stop}
							className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
						>
							<Loader2 className="size-4 animate-spin" />
						</button>
					) : (
						<button
							type="submit"
							disabled={!input.trim()}
							className="shrink-0 size-6 flex items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
						>
							<ArrowUp className="size-4" strokeWidth={2.5} />
						</button>
					)}
				</form>
			</div>

			{/* Messages / Suggestions */}
			<div
				ref={listRef}
				role="log"
				className="overflow-y-auto flex-1 p-3"
				onKeyDown={(e) => {
					if (e.key === "Escape") onClose();
				}}
			>
				{showSuggestions && (
					<div className="flex flex-col gap-3">
						<p className="text-xs text-muted-foreground">Try asking:</p>
						<p className="text-xs text-muted-foreground/80">
							We also offer{" "}
							<a
								href="https://docs.inkeep.com/talk-to-your-agents/vercel-ai-sdk/inkeep-provider#installation"
								target="_blank"
								rel="noreferrer"
								className="underline hover:text-foreground transition-colors"
							>
								Skills
							</a>{" "}
							and{" "}
							<a
								href="https://docs.inkeep.com/talk-to-your-agents/vercel-ai-sdk/inkeep-provider#installation"
								target="_blank"
								rel="noreferrer"
								className="underline hover:text-foreground transition-colors"
							>
								MCP servers
							</a>{" "}
							for local development integrations.
						</p>
						<div className="flex flex-wrap gap-2">
							{suggestions.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => handleSuggestionClick(s)}
									className="text-xs text-muted-foreground hover:text-foreground border border-foreground/[0.08] hover:border-foreground/[0.15] px-2.5 py-1.5 transition-colors text-left"
								>
									{s}
								</button>
							))}
						</div>
					</div>
				)}

				{!showSuggestions && (
					<div className="flex flex-col gap-4">
						{messages
							.filter((msg) => msg.role !== "system")
							.map((item, index, filtered) => {
								const isLastMessage = index === filtered.length - 1;
								const isCurrentlyStreaming =
									isLoading && item.role === "assistant" && isLastMessage;

								return (
									<AIMessage
										key={item.id}
										message={item}
										messages={filtered}
										messageIndex={index}
										isStreaming={isCurrentlyStreaming}
									/>
								);
							})}
						{status === "submitted" && <ThinkingIndicator />}
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="flex items-center justify-between border-t border-foreground/[0.06] px-3 py-1.5 text-[10px] text-muted-foreground">
				<div className="flex gap-2 items-center">
					{messages.length > 0 && !isLoading && (
						<button
							type="button"
							onClick={handleClear}
							className="flex items-center gap-1 hover:text-foreground transition-colors"
						>
							<Trash2 className="size-3" />
							<span>Clear</span>
						</button>
					)}
					<span>
						<kbd className="px-1 py-0.5 border border-foreground/[0.08]">
							esc
						</kbd>{" "}
						close
					</span>
				</div>
				<div className="flex items-center gap-1 truncate">
					<a
						href="https://docs.inkeep.com/"
						target="_blank"
						rel="noreferrer"
						className="hover:text-foreground transition-colors"
					>
						Powered by Inkeep
					</a>
				</div>
			</div>
		</>
	);
}

// ─── AI Text Input ───────────────────────────────────────────────────────────

function AITextInput({
	value,
	onChange,
	onSubmit,
	disabled,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
	disabled: boolean;
	placeholder: string;
}) {
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		ref.current?.focus();
	}, []);

	return (
		<div className="grid flex-1">
			<textarea
				ref={ref}
				id="nd-ai-input"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						onSubmit();
					}
				}}
				disabled={disabled}
				placeholder={placeholder}
				className="col-start-1 row-start-1 h-11 py-3 bg-transparent resize-none text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 font-mono"
				rows={1}
			/>
		</div>
	);
}

// ─── AI Message ──────────────────────────────────────────────────────────────

function AIMessage({
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
	const roleName: Record<string, string> = {
		user: "you",
		assistant: "BA bot",
	};

	let markdown = "";

	for (const part of message.parts ?? []) {
		if (part.type === "text") {
			markdown += part.text;
		}
	}

	// Fix incomplete code blocks
	const codeBlockCount = (markdown.match(/```/g) || []).length;
	if (codeBlockCount % 2 !== 0) {
		markdown += "\n```";
	}

	markdown = markdown
		.replace(/```(\w+)?\n/g, "\n```$1\n")
		.replace(/\n```\n/g, "\n```\n\n");

	return (
		<div {...props}>
			<p
				className={cn(
					"mb-1 text-xs font-medium text-muted-foreground",
					message.role === "assistant" && "text-foreground",
				)}
			>
				{roleName[message.role] ?? "unknown"}
			</p>
			<div className="text-sm prose prose-sm max-w-none">
				<Markdown text={markdown} />
			</div>
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

// ─── Thinking Indicator ──────────────────────────────────────────────────────

function ThinkingIndicator() {
	return (
		<div className="flex flex-col">
			<p className="mb-1 text-xs font-medium text-muted-foreground">BA bot</p>
			<div className="flex gap-1 items-end text-sm text-muted-foreground">
				<div className="flex gap-1 items-center opacity-70">
					<span className="inline-block size-1 bg-foreground rounded-full animate-bounce [animation-delay:0ms]" />
					<span className="inline-block size-1 opacity-80 bg-foreground rounded-full animate-bounce [animation-delay:150ms]" />
					<span className="inline-block size-1 bg-foreground rounded-full animate-bounce [animation-delay:300ms]" />
				</div>
			</div>
		</div>
	);
}
