"use client";

import { betterFetch } from "@better-fetch/fetch";
import { atom } from "jotai";
import { AlertCircle, Bot, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	isStreaming?: boolean;
}

export const aiChatModalAtom = atom(false);

interface AIChatModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function AIChatModal({ isOpen, onClose }: AIChatModalProps) {
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [apiError, setApiError] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [externalUserId] = useState<string>(
		() =>
			`better-auth-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
	);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const abortControllerRef = useRef<AbortController | null>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	useEffect(() => {
		return () => {
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	useEffect(() => {
		if (!isOpen) {
			setSessionId(null);
			setMessages([]);
			setInput("");
			setApiError(null);
		}
	}, [isOpen]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: input.trim(),
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsLoading(true);
		setApiError(null);

		const thinkingMessage: Message = {
			id: `thinking-${Date.now()}`,
			role: "assistant",
			content: "",
			timestamp: new Date(),
			isStreaming: false,
		};

		setMessages((prev) => [...prev, thinkingMessage]);

		abortControllerRef.current = new AbortController();

		try {
			const payload = {
				question: userMessage.content,
				stream: false, // Use non-streaming to get session_id
				session_id: sessionId, // Use existing session_id if available
				external_user_id: externalUserId, // Use consistent external_user_id for consistency on getting the context right
				fetch_existing: false,
			};

			const { data, error } = await betterFetch<{
				content?: string;
				answer?: string;
				response?: string;
				session_id?: string;
			}>("/api/ai-chat", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: abortControllerRef.current.signal,
			});

			if (error) {
				console.error("API Error Response:", error);
				throw new Error(`HTTP ${error.status}: ${error.message}`);
			}

			if (data.session_id) {
				setSessionId(data.session_id);
			}

			let answer = "";
			if (data.content) {
				answer = data.content;
			} else if (data.answer) {
				answer = data.answer;
			} else if (data.response) {
				answer = data.response;
			} else if (typeof data === "string") {
				answer = data;
			} else {
				console.error("Unexpected response format:", data);
				throw new Error("Unexpected response format from API");
			}

			await simulateStreamingEffect(answer, thinkingMessage.id);
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				console.log("Request was aborted");
				return;
			}

			console.error("Error calling AI API:", error);

			setMessages((prev) =>
				prev.map((msg) =>
					msg.id.startsWith("thinking-")
						? {
								id: (Date.now() + 1).toString(),
								role: "assistant" as const,
								content: `I encountered an error while processing your request. Please try again.`,
								timestamp: new Date(),
								isStreaming: false,
							}
						: msg,
				),
			);

			if (error instanceof Error) {
				setApiError(error.message);
			}
		} finally {
			setIsLoading(false);
			abortControllerRef.current = null;
		}
	};

	const simulateStreamingEffect = async (
		fullContent: string,
		thinkingMessageId: string,
	) => {
		const assistantMessageId = (Date.now() + 1).toString();
		let displayedContent = "";

		setMessages((prev) =>
			prev.map((msg) =>
				msg.id === thinkingMessageId
					? {
							id: assistantMessageId,
							role: "assistant" as const,
							content: "",
							timestamp: new Date(),
							isStreaming: true,
						}
					: msg,
			),
		);

		const words = fullContent.split(" ");
		for (let i = 0; i < words.length; i++) {
			displayedContent += (i > 0 ? " " : "") + words[i];

			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantMessageId
						? { ...msg, content: displayedContent }
						: msg,
				),
			);

			const delay = Math.random() * 50 + 20;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		setMessages((prev) =>
			prev.map((msg) =>
				msg.id === assistantMessageId ? { ...msg, isStreaming: false } : msg,
			),
		);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-w-4xl border-b h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bot className="h-5 w-5 text-primary" />
						Ask AI About Better Auth
					</DialogTitle>
					<DialogDescription>
						Ask questions about Better-Auth and get AI-powered answers
						{apiError && (
							<div className="flex items-center gap-2 mt-2 text-amber-600 dark:text-amber-400">
								<AlertCircle className="h-4 w-4" />
								<span className="text-xs">
									API Error: Something went wrong. Please try again.
								</span>
							</div>
						)}
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 flex flex-col min-h-0">
					<div
						className={cn(
							"flex-1 overflow-y-auto space-y-4 p-6",
							messages.length === 0 ? "overflow-y-hidden" : "overflow-y-auto",
						)}
					>
						{messages.length === 0 ? (
							<div className="flex h-full flex-col items-center justify-center text-center">
								<div className="mb-6">
									<div className="w-16 h-16 mx-auto bg-transparent border border-input/70 border-dashed rounded-none flex items-center justify-center mb-4">
										<Bot className="h-8 w-8 text-primary" />
									</div>
								</div>

								<div className="mb-8 max-w-md">
									<h3 className="text-xl font-semibold text-foreground mb-2">
										Ask About Better Auth
									</h3>
									<p className="text-muted-foreground text-sm leading-relaxed">
										I'm here to help you with Better Auth questions, setup
										guides, and implementation tips. Ask me anything!
									</p>
								</div>

								<div className="w-full max-w-lg">
									<p className="text-sm font-medium text-foreground mb-4">
										Try asking:
									</p>
									<div className="space-y-3">
										{[
											"How do I set up SSO with Google?",
											"How to integrate Better Auth with NextJs?",
											"How to setup Two Factor Authentication?",
										].map((question, index) => (
											<button
												key={index}
												onClick={() => setInput(question)}
												className="w-full text-left p-3 rounded-none border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 group"
											>
												<div className="flex items-center gap-3">
													<div className="w-6 h-6 rounded-none bg-transparent border border-input/70 border-dashed flex items-center justify-center group-hover:bg-primary/20 transition-colors">
														<span className="text-xs text-primary font-medium">
															{index + 1}
														</span>
													</div>
													<span className="text-sm text-foreground group-hover:text-primary transition-colors">
														{question}
													</span>
												</div>
											</button>
										))}
									</div>
								</div>
							</div>
						) : (
							messages.map((message) => (
								<div
									key={message.id}
									className={cn(
										"flex gap-3",
										message.role === "user" ? "justify-end" : "justify-start",
									)}
								>
									{message.role === "assistant" && (
										<div className="flex-shrink-0">
											<div className="w-8 h-8 rounded-full bg-transparent border border-input/70 border-dashed flex items-center justify-center">
												<Bot className="h-4 w-4 text-primary" />
											</div>
										</div>
									)}
									<div
										className={cn(
											"max-w-[80%] rounded-xl px-4 py-3 shadow-sm",
											message.role === "user"
												? "bg-primary text-primary-foreground"
												: "bg-background border border-border/50",
										)}
									>
										{message.role === "assistant" ? (
											<div className="w-full">
												{message.id.startsWith("thinking-") ? (
													<div className="flex items-center gap-2 text-sm text-muted-foreground">
														<div className="flex space-x-1">
															<div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]"></div>
															<div className="w-1 h-1 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]"></div>
															<div className="w-1 h-1 bg-primary rounded-full animate-bounce"></div>
														</div>
														<span>Thinking...</span>
													</div>
												) : (
													<>
														<MarkdownRenderer content={message.content} />
														{message.isStreaming && (
															<div className="inline-block w-2 h-4 bg-primary streaming-cursor ml-1" />
														)}
													</>
												)}
											</div>
										) : (
											<p className="text-sm">{message.content}</p>
										)}
									</div>
									{message.role === "user" && (
										<div className="flex-shrink-0">
											<div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
												<User className="h-4 w-4" />
											</div>
										</div>
									)}
								</div>
							))
						)}
						<div ref={messagesEndRef} />
					</div>

					<div className="border-t px-0 bg-background/50 backdrop-blur-sm p-4">
						<div className="relative max-w-4xl mx-auto">
							<div
								className={cn(
									"relative flex flex-col border-input rounded-lg transition-all duration-200 w-full text-left",
									"ring-1 ring-border/20 bg-muted/30 border-input border-1 backdrop-blur-sm",
									"focus-within:ring-primary/30 focus-within:bg-muted/[35%]",
								)}
							>
								<div className="overflow-y-auto max-h-[200px]">
									<Textarea
										value={input}
										onChange={(e) => setInput(e.target.value)}
										placeholder="Ask a question about Better-Auth..."
										className="w-full rounded-none rounded-b-none px-4 py-3 h-[70px] bg-transparent border-none text-foreground placeholder:text-muted-foreground resize-none focus-visible:ring-0 leading-[1.2] min-h-[52px] max-h-32"
										disabled={isLoading}
										onKeyDown={(e) => {
											if (e.key === "Enter" && !e.shiftKey) {
												e.preventDefault();
												void handleSubmit(e);
											}
										}}
									/>
								</div>

								<div className="h-12 bg-muted/20 rounded-b-xl flex items-center justify-end px-3">
									<button
										type="submit"
										onClick={(e) => {
											e.preventDefault();
											void handleSubmit(e);
										}}
										disabled={!input.trim() || isLoading}
										className={cn(
											"rounded-lg p-2 transition-all duration-200",
											input.trim() && !isLoading
												? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md"
												: "bg-muted/50 text-muted-foreground cursor-not-allowed",
										)}
									>
										{isLoading ? (
											<div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
										) : (
											<Send className="h-4 w-4" />
										)}
									</button>
								</div>
							</div>
						</div>

						<div className="mt-3 text-center">
							<p className="text-xs text-muted-foreground">
								Press{" "}
								<kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">
									Enter
								</kbd>{" "}
								to send,{" "}
								<kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">
									Shift+Enter
								</kbd>{" "}
								for new line
							</p>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
