"use client";

import { useState, useRef, useEffect } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Send, Loader2, Bot, User, AlertCircle } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	isStreaming?: boolean;
}

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

			const response = await fetch("/api/ai-chat", {
				method: "POST",
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: abortControllerRef.current.signal,
			});

			if (!response.ok) {
				const errorText = await response.text();
				console.error("API Error Response:", errorText);
				throw new Error(`HTTP ${response.status}: ${errorText}`);
			}

			// Since we're using stream: false, we'll always get JSON response
			const data = await response.json();

			// Extract session_id for future requests
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
			<DialogContent className="max-w-4xl h-[80vh] flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Bot className="h-5 w-5 text-primary" />
						Ask AI Assistant
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
					<div className="flex-1 overflow-y-auto space-y-4 p-6">
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-full text-center">
								<div className="mb-6">
									<div className="w-16 h-16 mx-auto bg-transparent border border-input/70 border-dashed rounded-none flex items-center justify-center mb-4">
										<Bot className="h-8 w-8 text-primary" />
									</div>
								</div>

								<div className="mb-8 max-w-md">
									<h3 className="text-xl font-semibold text-foreground mb-2">
										Welcome to Better-Auth AI Assistant
									</h3>
									<p className="text-muted-foreground text-sm leading-relaxed">
										I'm here to help you with Better-Auth questions, setup
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

					<div className="border-t bg-background/50 backdrop-blur-sm">
						<form onSubmit={handleSubmit} className="flex gap-3 p-4 px-0">
							<div className="flex-1 items-end justify-end relative">
								<Textarea
									value={input}
									onChange={(e) => setInput(e.target.value)}
									placeholder="Ask a question about Better-Auth..."
									className="min-h-[60px] rounded-none max-h-32 resize-none border-border/90 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 bg-background/80 backdrop-blur-sm transition-all duration-200"
									disabled={isLoading}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											handleSubmit(e);
										}
									}}
								/>
							</div>
							<Button
								type="submit"
								disabled={!input.trim() || isLoading}
								size="icon"
								className="min-h-[40px] min-w-[40px] shrink-0 bg-primary hover:bg-primary/90 transition-all duration-200"
							>
								{isLoading ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Send className="h-4 w-4" />
								)}
							</Button>
						</form>
						<div className="px-0 pb-2">
							<p className="text-xs flex gap-1 text-muted-foreground">
								Press <pre>Enter</pre> to send, <pre>Shift+Enter</pre> for new
								line
							</p>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
