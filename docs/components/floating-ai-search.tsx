"use client";
import { RemoveScroll } from "react-remove-scroll";
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
import { Loader2, SearchIcon, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import Link from "fumadocs-core/link";
import { Markdown } from "./markdown";
import { Presence } from "@radix-ui/react-presence";
import { betterFetch } from "@better-fetch/fetch";

const Context = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
	messages: Array<{ id: string; role: "user" | "assistant"; content: string }>;
	isLoading: boolean;
	sendMessage: (text: string) => void;
	clearMessages: () => void;
} | null>(null);

function useChatContext() {
	return use(Context)!;
}

function SearchAIActions() {
	const { messages, isLoading, clearMessages } = useChatContext();

	if (messages.length === 0) return null;

	return (
		<>
			<button
				type="button"
				className={cn(
					buttonVariants({
						color: "secondary",
						size: "sm",
						className: "rounded-full",
					}),
				)}
				onClick={clearMessages}
			>
				Clear Chat
			</button>
		</>
	);
}

function SearchAIInput(props: ComponentProps<"form">) {
	const { sendMessage, isLoading } = useChatContext();
	const [input, setInput] = useState("");

	const onStart = (e?: SyntheticEvent) => {
		e?.preventDefault();
		if (input.trim()) {
			sendMessage(input.trim());
			setInput("");
		}
	};

	useEffect(() => {
		if (isLoading) document.getElementById("nd-ai-input")?.focus();
	}, [isLoading]);

	return (
		<form
			{...props}
			className={cn("flex items-start pe-2", props.className)}
			onSubmit={onStart}
		>
			<Input
				value={input}
				placeholder={isLoading ? "AI is answering..." : "Ask AI"}
				autoFocus
				className="p-4"
				disabled={isLoading}
				onChange={(e) => {
					setInput(e.target.value);
				}}
				onKeyDown={(event) => {
					if (!event.shiftKey && event.key === "Enter") {
						onStart(event);
					}
				}}
			/>
			<button
				key="bn"
				type="submit"
				className={cn(
					buttonVariants({
						color: "secondary",
						className: "transition-all rounded-full mt-2",
					}),
				)}
				disabled={input.length === 0 || isLoading}
			>
				{isLoading ? (
					<Loader2 className="size-4 animate-spin" />
				) : (
					<Send className="size-4" />
				)}
			</button>
		</form>
	);
}

function List(props: Omit<ComponentProps<"div">, "dir">) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!containerRef.current) return;
		function callback() {
			const container = containerRef.current;
			if (!container) return;

			container.scrollTo({
				top: container.scrollHeight,
				behavior: "instant",
			});
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
	assistant: "better-auth bot",
};

function Message({
	message,
	...props
}: {
	message: {
		id: string;
		role: "user" | "assistant";
		content: string;
		references?: Array<{ link: string; title: string; icon?: string }>;
		isStreaming?: boolean;
	};
} & ComponentProps<"div">) {
	return (
		<div {...props}>
			<p
				className={cn(
					"mb-2 text-sm font-medium text-fd-muted-foreground",
					message.role === "assistant" && "text-fd-primary",
				)}
			></p>
			<div className="prose text-sm">
				<Markdown text={message.content} />
				{message.isStreaming && (
					<span className="inline-block w-2 h-4 bg-fd-primary ml-1 animate-pulse" />
				)}
			</div>
			{message.references &&
				message.references.length > 0 &&
				!message.isStreaming && (
					<div className="mt-3 flex flex-col gap-2">
						<p className="text-xs font-medium text-fd-muted-foreground">
							References:
						</p>
						<div className="flex flex-col gap-1">
							{message.references.map((ref, i) => (
								<Link
									key={i}
									href={ref.link}
									className="flex items-center gap-2 text-xs rounded-lg border p-2 hover:bg-fd-accent hover:text-fd-accent-foreground transition-colors"
									target="_blank"
									rel="noopener noreferrer"
								>
									{ref.icon && (
										<img
											src={ref.icon}
											alt=""
											className="w-4 h-4 flex-shrink-0"
											onError={(e) => {
												e.currentTarget.style.display = "none";
											}}
										/>
									)}
									<span className="truncate">{ref.title}</span>
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
	const [messages, setMessages] = useState<
		Array<{
			id: string;
			role: "user" | "assistant";
			content: string;
			references?: Array<{ link: string; title: string; icon?: string }>;
			isStreaming?: boolean;
		}>
	>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [input, setInput] = useState("");
	const [sessionId, setSessionId] = useState<string>("");
	const [questionCount, setQuestionCount] = useState(0);

	const streamText = (
		messageId: string,
		fullText: string,
		references?: Array<{ link: string; title: string; icon?: string }>,
	) => {
		const words = fullText.split(" ");
		let currentText = "";
		let wordIndex = 0;

		const streamInterval = setInterval(() => {
			if (wordIndex < words.length) {
				currentText += (wordIndex > 0 ? " " : "") + words[wordIndex];
				wordIndex++;

				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === messageId
							? {
									...msg,
									content: currentText,
									isStreaming: false,
								}
							: msg,
					),
				);
			} else {
				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === messageId
							? { ...msg, isStreaming: false, references }
							: msg,
					),
				);
				clearInterval(streamInterval);
			}
		}, 30);

		return () => clearInterval(streamInterval);
	};

	const sendMessage = async (text: string) => {
		if (!text.trim()) return;

		const userMessage = {
			id: Date.now().toString(),
			role: "user" as const,
			content: text,
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);
		setQuestionCount((prev) => prev + 1);

		const messageId = (Date.now() + 1).toString();
		const assistantMessage = {
			id: messageId,
			role: "assistant" as const,
			content: "",
			isStreaming: true,
		};

		setMessages((prev) => [...prev, assistantMessage]);

		try {
			const currentQuestionNumber = questionCount + 1;
			const isFirstQuestion = currentQuestionNumber === 1;
			const isSecondQuestion = currentQuestionNumber === 2;

			if (!isFirstQuestion) {
				const requestBody: any = {
					question: text,
					stream: false,
					fetch_existing: true,
				};

				if (!isSecondQuestion && sessionId) {
					requestBody.session_id = sessionId;
				}

				const { data, error } = await betterFetch<{
					content?: string;
					answer?: string;
					response?: string;
					session_id?: string;
					references?: Array<{ link: string; title: string; icon?: string }>;
					error?: string;
				}>("/api/ai-chat", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(requestBody),
				});

				if (error) {
					console.error("API Error Response:", error);
					throw new Error(`HTTP ${error.status}: ${error.message}`);
				}

				let responseContent = "";
				if (data.content) {
					responseContent = data.content;
				} else if (data.answer) {
					responseContent = data.answer;
				} else if (data.response) {
					responseContent = data.response;
				} else if (data.error) {
					responseContent = data.error;
				} else {
					responseContent = "No response received";
				}

				const filteredReferences = data.references?.filter(
					(ref) => !ref.link.includes("github.com"),
				);

				streamText(messageId, responseContent, filteredReferences);

				if (isSecondQuestion && data.session_id) {
					setSessionId(data.session_id);
				}
			} else {
				const streamRequestBody = {
					question: text,
					stream: true,
					external_user_id: "floating-ai-user",
				};

				const streamResponse = await fetch("/api/ai-chat", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(streamRequestBody),
				});

				if (!streamResponse.ok) {
					throw new Error(`HTTP error! status: ${streamResponse.status}`);
				}

				const reader = streamResponse.body?.getReader();
				const decoder = new TextDecoder();
				let accumulatedContent = "";

				if (reader) {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						const chunk = decoder.decode(value, { stream: true });
						accumulatedContent += chunk;

						setMessages((prev) =>
							prev.map((msg) =>
								msg.id === messageId
									? { ...msg, content: accumulatedContent, isStreaming: true }
									: msg,
							),
						);
					}
				}

				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === messageId ? { ...msg, isStreaming: false } : msg,
					),
				);

				const fetchReferencesBody = {
					question: text,
					stream: false,
					fetch_existing: true,
					external_user_id: "floating-ai-user",
				};

				const { data: referencesData } = await betterFetch<{
					references?: Array<{ link: string; title: string; icon?: string }>;
					session_id?: string;
				}>("/api/ai-chat", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(fetchReferencesBody),
				});

				if (
					referencesData?.references &&
					referencesData.references.length > 0
				) {
					const filteredReferences = referencesData.references.filter(
						(ref) => !ref.link.includes("github.com"),
					);

					if (filteredReferences.length > 0) {
						setMessages((prev) =>
							prev.map((msg) =>
								msg.id === messageId
									? { ...msg, references: filteredReferences }
									: msg,
							),
						);
					}
				}
			}
		} catch (error) {
			console.error("Error sending message:", error);

			setMessages((prev) => {
				const filtered = prev.filter((msg) => msg.id !== messageId);
				return [
					...filtered,
					{
						id: messageId,
						role: "assistant" as const,
						content:
							"Sorry, there was an error processing your request. Please try again.",
					},
				];
			});
		} finally {
			setIsLoading(false);
		}
	};

	const clearMessages = () => {
		setMessages([]);
		setSessionId("");
		setQuestionCount(0);
	};

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
		<Context
			value={useMemo(
				() => ({
					messages,
					isLoading,
					sendMessage,
					clearMessages,
					open,
					setOpen,
				}),
				[messages, isLoading, open],
			)}
		>
			<RemoveScroll enabled={open}>
				<Presence present={open}>
					<div
						className={cn(
							"fixed inset-0 p-2 right-(--removed-body-scroll-bar-size,0) flex flex-col pb-[8.375rem] items-center bg-fd-background/80 backdrop-blur-sm z-50",
							open ? "animate-fd-fade-in" : "animate-fd-fade-out",
						)}
						onClick={(e) => {
							if (e.target === e.currentTarget) {
								setOpen(false);
								e.preventDefault();
							}
						}}
					>
						<div className="sticky top-0 flex gap-2 items-center py-2 w-full max-w-[600px]">
							<p className="text-xs flex-1 text-fd-muted-foreground"></p>
							<button
								aria-label="Close"
								tabIndex={-1}
								className={cn(
									buttonVariants({
										size: "icon-sm",
										color: "secondary",
										className: "rounded-full",
									}),
								)}
								onClick={() => setOpen(false)}
							>
								<X />
							</button>
						</div>
						<List
							className="py-10 pr-2 w-full max-w-[600px] overscroll-contain"
							style={{
								maskImage:
									"linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 2rem), transparent 100%)",
							}}
						>
							<div className="flex flex-col gap-4">
								{messages.map((item) => (
									<Message key={item.id} message={item} />
								))}
								{isLoading && (
									<div className="flex items-center gap-2 text-sm text-fd-muted-foreground">
										<Loader2 className="size-4 animate-spin" />
										AI is thinking...
									</div>
								)}
							</div>
						</List>
					</div>
				</Presence>
				<div
					className={cn(
						"fixed bottom-2 transition-[width,height] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] -translate-x-1/2 rounded-2xl border shadow-xl z-50 overflow-hidden",
						open
							? "w-[min(600px,90vw)] bg-fd-popover h-32"
							: "w-40 h-10 bg-fd-secondary text-fd-secondary-foreground shadow-fd-background",
					)}
					style={{
						left: "calc(50% - var(--removed-body-scroll-bar-size,0px)/2)",
					}}
				>
					<Presence present={!open}>
						<button
							className={cn(
								"absolute inset-0 text-center p-2 text-fd-muted-foreground text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground",
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
							<div className="flex items-center gap-1.5 p-1 empty:hidden">
								<SearchAIActions />
							</div>
						</div>
					</Presence>
				</div>
			</RemoveScroll>
		</Context>
	);
}
