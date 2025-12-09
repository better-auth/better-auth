import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText } from "ai";
import { ProvideLinksToolSchema } from "@/lib/chat/inkeep-qa-schema";
import type { InkeepMessage } from "@/lib/inkeep-analytics";
import { logConversationToAnalytics } from "@/lib/inkeep-analytics";

export const runtime = "edge";

const openai = createOpenAICompatible({
	name: "inkeep",
	apiKey: process.env.INKEEP_API_KEY,
	baseURL: "https://api.inkeep.com/v1",
});

export async function POST(req: Request) {
	const reqJson = await req.json();

	const result = streamText({
		model: openai("inkeep-qa-sonnet-4"),
		tools: {
			provideLinks: {
				inputSchema: ProvideLinksToolSchema,
			},
		},
		messages: convertToModelMessages(reqJson.messages, {
			ignoreIncompleteToolCalls: true,
		}),
		toolChoice: "auto",
		onFinish: async (event) => {
			try {
				const extractMessageContent = (msg: any): string => {
					if (typeof msg.content === "string") {
						return msg.content;
					}

					if (msg.parts && Array.isArray(msg.parts)) {
						return msg.parts
							.filter((part: any) => part.type === "text")
							.map((part: any) => part.text)
							.join("");
					}

					if (msg.text) {
						return msg.text;
					}

					return "";
				};

				const assistantMessageId =
					event.response.id ||
					`assistant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

				const inkeepMessages: InkeepMessage[] = [
					...reqJson.messages
						.map((msg: any) => ({
							id:
								msg.id ||
								`msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
							role: msg.role,
							content: extractMessageContent(msg),
						}))
						.filter((msg: any) => msg.content.trim() !== ""),
					{
						id: assistantMessageId,
						role: "assistant" as const,
						content: event.text,
					},
				];

				await logConversationToAnalytics({
					type: "openai",
					messages: inkeepMessages,
					properties: {
						source: "better-auth-docs",
						timestamp: new Date().toISOString(),
						model: "inkeep-qa-sonnet-4",
					},
				});
			} catch (error) {
				// Don't fail the request if analytics logging fails
			}
		},
	});

	return result.toUIMessageStreamResponse();
}
