"use client";

import type { UIMessage } from "@ai-sdk/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, MessageCircleIcon, RefreshCw, Send, X } from "lucide-react";
import type { ComponentProps, ReactNode, SyntheticEvent } from "react";
import {
	createContext,
	use,
	useCallback,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { MessageFeedback } from "./message-feedback";
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "./ui/drawer";

// ─── Context ─────────────────────────────────────────────────────────────────

const AIChatContext = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
	chat: ReturnType<typeof useChat>;
} | null>(null);

export function useAIChat() {
	const ctx = use(AIChatContext);
	if (!ctx) throw new Error("Missing <AIChat />");
	return ctx;
}

function useChatContext() {
	return useAIChat().chat;
}

// ─── Root ────────────────────────────────────────────────────────────────────

const DEFAULT_PANEL_WIDTH = 400;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 640;

const chatTransport = new DefaultChatTransport({
	api: "/api/docs/chat",
});

/** Dispatched to open the panel from outside the provider tree (e.g. mobile top nav). */
export const OPEN_AI_CHAT_EVENT = "better-auth:open-ai-chat";

export function AIChat({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const chat = useChat({
		id: "ai-chat",
		transport: chatTransport,
	});

	useEffect(() => {
		const onOpen = () => setOpen(true);
		window.addEventListener(OPEN_AI_CHAT_EVENT, onOpen);
		return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, onOpen);
	}, []);

	// Support ?askai= URL param
	const handleAskAiParam = useEffectEvent(() => {
		const params = new URLSearchParams(window.location.search);
		const aiQuery = params.get("askai");
		if (aiQuery) {
			setOpen(true);
			void chat.sendMessage({ text: aiQuery });
			const newParams = new URLSearchParams(window.location.search);
			newParams.delete("askai");
			const newUrl = newParams.toString()
				? `${window.location.pathname}?${newParams.toString()}`
				: window.location.pathname;
			window.history.replaceState({}, "", newUrl);
		}
	});

	useEffect(() => {
		handleAskAiParam();
	}, []);

	return (
		<AIChatContext
			value={useMemo(() => ({ chat, open, setOpen }), [chat, open])}
		>
			{children}
		</AIChatContext>
	);
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

export function AIChatTrigger({
	className,
	...props
}: ComponentProps<"button">) {
	const { open, setOpen } = useAIChat();

	return (
		<button
			type="button"
			data-state={open ? "open" : "closed"}
			className={cn(
				"fixed bottom-5 end-5 z-20 flex items-center gap-2.5 px-3.5 py-1.5 border bg-secondary/70 backdrop-blur-md shadow-lg transition-[translate,opacity]",
				open && "translate-y-10 opacity-0",
				className,
			)}
			onClick={() => setOpen(!open)}
			{...props}
		/>
	);
}

// ─── Panel ───────────────────────────────────────────────────────────────────

const LG_BREAKPOINT = 1024;

function useIsDesktop() {
	const [isDesktop, setIsDesktop] = useState<boolean | undefined>(undefined);

	useEffect(() => {
		const mql = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
		const onChange = () => setIsDesktop(mql.matches);
		mql.addEventListener("change", onChange);
		setIsDesktop(mql.matches);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isDesktop;
}

export function AIChatPanel() {
	const isDesktop = useIsDesktop();
	useAIChatHotKey();

	// SSR / hydration: render nothing until we know the viewport
	if (isDesktop === undefined) return null;

	return isDesktop ? <DesktopPanel /> : <MobileDrawerPanel />;
}

function useVisualViewportHeight() {
	const [height, setHeight] = useState<number | undefined>(undefined);

	useEffect(() => {
		const vv = window.visualViewport;
		if (!vv) return;
		const update = () => setHeight(vv.height);
		update();
		vv.addEventListener("resize", update);
		return () => vv.removeEventListener("resize", update);
	}, []);

	return height;
}

function MobileDrawerPanel() {
	const { open, setOpen } = useAIChat();
	const vvHeight = useVisualViewportHeight();

	// 85% of the visual viewport (shrinks when keyboard opens)
	const drawerHeight = vvHeight ? vvHeight * 0.85 : undefined;

	return (
		<Drawer
			open={open}
			onOpenChange={setOpen}
			repositionInputs={false}
			handleOnly
		>
			<DrawerContent
				style={
					drawerHeight
						? { height: drawerHeight, maxHeight: drawerHeight }
						: undefined
				}
				className={drawerHeight ? undefined : "h-[85dvh] max-h-[85dvh]"}
			>
				<DrawerHeader className="flex flex-row items-center gap-2 border-b">
					<div className="flex-1 text-left">
						<DrawerTitle className="text-xs font-medium">AI Chat</DrawerTitle>
						<DrawerDescription className="text-[10px]">
							Better Auth docs assistant
						</DrawerDescription>
					</div>
					<DrawerClose
						aria-label="Close"
						className="p-1 text-muted-foreground hover:text-foreground transition-colors"
					>
						<X className="size-4" />
					</DrawerClose>
				</DrawerHeader>
				<div className="flex flex-col flex-1 w-full min-h-0 overflow-hidden px-2 pb-3">
					<PanelMessages className="flex-1" />
					<PanelInput autoFocus={false} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function DesktopPanel() {
	const { open } = useAIChat();
	const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
	const [dragging, setDragging] = useState(false);
	const startX = useRef(0);
	const startWidth = useRef(panelWidth);

	useEffect(() => {
		if (!dragging) return;

		const onMouseMove = (e: MouseEvent) => {
			const delta = startX.current - e.clientX;
			setPanelWidth(
				Math.min(
					MAX_PANEL_WIDTH,
					Math.max(MIN_PANEL_WIDTH, startWidth.current + delta),
				),
			);
		};
		const onMouseUp = () => setDragging(false);

		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [dragging]);

	if (!open) return null;

	return (
		<>
			<div
				className={cn(
					"overflow-hidden overscroll-contain z-200 bg-background text-foreground",
					"fixed top-0 inset-e-0 h-dvh border-s",
					"shadow-[-8px_0_24px_-4px_rgba(0,0,0,0.1)] dark:shadow-[-8px_0_30px_-2px_rgba(0,0,0,0.7)]",
				)}
				style={{ width: panelWidth }}
			>
				{/* Resize handle */}
				<div
					className="absolute top-0 bottom-0 left-0 w-1 cursor-col-resize hover:bg-foreground/10 active:bg-foreground/15 transition-colors z-10"
					onMouseDown={(e) => {
						e.preventDefault();
						startX.current = e.clientX;
						startWidth.current = panelWidth;
						setDragging(true);
					}}
				/>
				<div
					className="flex flex-col size-full min-h-0 overflow-hidden p-3"
					style={{ width: panelWidth }}
				>
					<PanelHeader />
					<PanelMessages className="flex-1" />
					<PanelInput autoFocus />
				</div>
			</div>

			{/* Full-screen overlay during drag */}
			{dragging && <div className="fixed inset-0 z-[201] cursor-col-resize" />}
		</>
	);
}

// ─── Panel Header ────────────────────────────────────────────────────────────

function PanelHeader() {
	const { setOpen } = useAIChat();

	return (
		<div className="flex items-center gap-2 border-b px-3 pb-3">
			<div className="flex-1">
				<p className="text-sm font-medium">AI Chat</p>
				<p className="text-[10px] text-muted-foreground">
					Better Auth docs assistant
				</p>
			</div>
			<button
				type="button"
				aria-label="Close"
				className="p-1 text-muted-foreground hover:text-foreground transition-colors"
				onClick={() => setOpen(false)}
			>
				<X className="size-4" />
			</button>
		</div>
	);
}

// ─── Panel Messages ──────────────────────────────────────────────────────────

function PanelMessages({ className, ...props }: ComponentProps<"div">) {
	const { messages } = useChatContext();
	const containerRef = useRef<HTMLDivElement>(null);
	const filtered = messages.filter((msg) => msg.role !== "system");

	useEffect(() => {
		if (!containerRef.current) return;
		const container = containerRef.current;

		const scrollToBottom = () => {
			container.scrollTo({
				top: container.scrollHeight,
				behavior: "instant",
			});
		};

		// Observe size changes on all current and future children
		const resizeObserver = new ResizeObserver(scrollToBottom);
		const observeChildren = () => {
			resizeObserver.disconnect();
			for (const child of container.children) {
				resizeObserver.observe(child);
			}
		};

		observeChildren();

		// Re-attach when children are added/removed
		const mutationObserver = new MutationObserver(observeChildren);
		mutationObserver.observe(container, { childList: true });

		// Prevent scroll chaining to body on desktop
		const onWheel = (e: WheelEvent) => {
			const { scrollTop, scrollHeight, clientHeight } = container;
			const atTop = scrollTop <= 0 && e.deltaY < 0;
			const atBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;
			if (atTop || atBottom) {
				e.preventDefault();
			}
		};
		container.addEventListener("wheel", onWheel, { passive: false });

		return () => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
			container.removeEventListener("wheel", onWheel);
		};
	}, []);

	return (
		<div
			ref={containerRef}
			className={cn(
				"ai-chat-messages overflow-y-auto overscroll-contain min-w-0 min-h-0 flex flex-col py-4 select-text",
				className,
			)}
			style={{
				maskImage:
					"linear-gradient(to bottom, transparent, white 1rem, white calc(100% - 1rem), transparent 100%)",
			}}
			{...props}
		>
			{filtered.length === 0 ? (
				<div className="size-full flex flex-col items-center justify-center text-center gap-2 text-sm text-muted-foreground/80 py-6">
					<MessageCircleIcon
						fill="currentColor"
						stroke="none"
						className="size-5"
					/>
					<p>Start a new chat below.</p>
				</div>
			) : (
				<div className="flex flex-col px-1 gap-4">
					{filtered.map((item, index) => (
						<Message
							key={item.id}
							message={item}
							messages={filtered}
							messageIndex={index}
						/>
					))}
					<ThinkingIndicator />
				</div>
			)}
		</div>
	);
}

// ─── Panel Input ─────────────────────────────────────────────────────────────

function PanelInput({ autoFocus = false }: { autoFocus?: boolean }) {
	const { status, sendMessage, stop, setMessages, messages, regenerate } =
		useChatContext();
	const [input, setInput] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isLoading = status === "streaming" || status === "submitted";
	const inputDragRef = useRef<{ startY: number; startHeight: number } | null>(
		null,
	);
	const [inputMinHeight, setInputMinHeight] = useState(38);

	const adjustHeight = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		const maxH = window.innerHeight * 0.35;
		el.style.height = "auto";
		el.style.height = `${Math.min(maxH, Math.max(el.scrollHeight, inputMinHeight))}px`;
	}, [inputMinHeight]);

	useEffect(() => {
		adjustHeight();
	}, [adjustHeight]);

	const onSubmit = (e?: SyntheticEvent) => {
		e?.preventDefault();
		if (!input.trim() || isLoading) return;
		void sendMessage({ text: input });
		setInput("");
		requestAnimationFrame(adjustHeight);
	};

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			inputDragRef.current = { startY: e.clientY, startHeight: inputMinHeight };
			const onMove = (ev: MouseEvent) => {
				if (!inputDragRef.current) return;
				const delta = inputDragRef.current.startY - ev.clientY;
				setInputMinHeight(
					Math.max(38, Math.min(400, inputDragRef.current.startHeight + delta)),
				);
			};
			const onUp = () => {
				inputDragRef.current = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "row-resize";
		},
		[inputMinHeight],
	);

	return (
		<div className="relative">
			{/* Drag handle to resize input */}
			<div
				onMouseDown={handleDragStart}
				className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10 hidden lg:flex items-center justify-center w-8 h-3 cursor-row-resize group/drag"
			>
				<div className="w-8 h-[2px] rounded-full bg-foreground/20 dark:bg-white/20 group-hover/drag:bg-foreground/40 transition-colors" />
			</div>
			<div
				className={cn(
					"rounded-xl border transition-all duration-200",
					"border-border/60 dark:border-white/8",
					"bg-card/50 dark:bg-white/2",
					"focus-within:border-foreground/15 dark:focus-within:border-white/12",
					"focus-within:bg-background dark:focus-within:bg-white/3",
					"focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.04)] dark:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
				)}
			>
				<form onSubmit={onSubmit}>
					<div className="flex items-end">
						<textarea
							ref={textareaRef}
							id="nd-ai-input"
							value={input}
							onChange={(e) => {
								setInput(e.target.value);
								adjustHeight();
							}}
							onKeyDown={(e) => {
								if (!e.shiftKey && e.key === "Enter") {
									e.preventDefault();
									onSubmit();
								}
							}}
							disabled={isLoading}
							placeholder={isLoading ? "AI is answering..." : "Ask a question"}
							autoFocus={autoFocus}
							rows={1}
							style={{
								height: Math.max(inputMinHeight, 38),
							}}
							className="flex-1 resize-none text-base lg:text-[13px] bg-transparent pl-3.5 pr-1.5 py-2.5 placeholder:text-muted-foreground focus:outline-none overflow-y-auto"
						/>
						<div className="shrink-0 pb-1.5 pr-1.5">
							{isLoading ? (
								<button
									type="button"
									onClick={stop}
									className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 cursor-pointer"
									title="Stop generating"
								>
									<Loader2 className="size-3.5 animate-spin" />
								</button>
							) : (
								<button
									type="submit"
									disabled={input.trim().length === 0}
									className={cn(
										"inline-flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150",
										input.trim()
											? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
											: "bg-muted/50 dark:bg-white/5 text-muted-foreground cursor-default",
									)}
									title="Send (Enter)"
								>
									<Send className="size-3.5" />
								</button>
							)}
						</div>
					</div>
				</form>
			</div>
			<div className="flex items-center gap-1.5 p-1 empty:hidden">
				{!isLoading &&
					messages.length > 0 &&
					messages.at(-1)?.role === "assistant" && (
						<button
							type="button"
							className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-full text-muted-foreground hover:text-foreground transition-colors"
							onClick={() => regenerate()}
						>
							<RefreshCw className="size-3" />
							Retry
						</button>
					)}
				{messages.length > 0 && !isLoading && (
					<button
						type="button"
						className="flex items-center gap-1.5 px-2.5 py-1 text-xs border rounded-full text-muted-foreground hover:text-foreground transition-colors"
						onClick={() => setMessages([])}
					>
						Clear Chat
					</button>
				)}
			</div>
		</div>
	);
}

// ─── Thinking Indicator ──────────────────────────────────────────────────────

function ThinkingIndicator() {
	const { status, messages } = useChatContext();
	const lastMessage = messages.at(-1);
	const hasNoText =
		!lastMessage ||
		lastMessage.role !== "assistant" ||
		!lastMessage.parts?.some((p) => p.type === "text" && p.text.length > 0);

	if (status !== "submitted" && !(status === "streaming" && hasNoText))
		return null;

	return (
		<div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
			<Loader2 className="size-3 animate-spin" />
			<span>Looking through docs...</span>
		</div>
	);
}

// ─── Message ─────────────────────────────────────────────────────────────────

const roleName: Record<string, string> = {
	user: "you",
	assistant: "BA bot",
};

function Message({
	message,
	messages,
	messageIndex,
}: {
	message: UIMessage;
	messages: UIMessage[];
	messageIndex: number;
}) {
	const { status } = useChatContext();
	const isLastAssistant =
		message.role === "assistant" && messageIndex === messages.length - 1;
	const isStreaming =
		(status === "streaming" || status === "submitted") && isLastAssistant;

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

	return (
		<div>
			<p
				className={cn(
					"mb-1 text-xs font-medium text-muted-foreground",
					message.role === "assistant" && "text-foreground",
				)}
			>
				{roleName[message.role] ?? "unknown"}
			</p>
			<div className="text-sm prose prose-sm max-w-none [&_pre]:!text-[11px]">
				<Markdown text={markdown} />
			</div>
			{message.role === "assistant" && message.id && !isStreaming && (
				<MessageFeedback
					messageId={message.id}
					userMessageId={
						messageIndex > 0 ? messages[messageIndex - 1]?.id : undefined
					}
					content={markdown}
				/>
			)}
		</div>
	);
}

// ─── Hot Key ─────────────────────────────────────────────────────────────────

function useAIChatHotKey() {
	const { open, setOpen } = useAIChat();

	const onKeyPress = useEffectEvent((e: KeyboardEvent) => {
		if (e.key === "Escape" && open) {
			setOpen(false);
			e.preventDefault();
		}
		if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
			setOpen(!open);
			e.preventDefault();
		}
	});

	useEffect(() => {
		window.addEventListener("keydown", onKeyPress);
		return () => window.removeEventListener("keydown", onKeyPress);
	}, []);
}
