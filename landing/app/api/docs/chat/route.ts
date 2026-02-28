import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { convertToModelMessages, streamText } from "ai";

const inkeep = createOpenAICompatible({
	name: "inkeep",
	baseURL: "https://api.inkeep.com/v1",
	apiKey: process.env.INKEEP_API_KEY,
});

export async function POST(req: Request) {
	const { messages } = await req.json();

	const result = streamText({
		model: inkeep.chatModel("inkeep-qa-expert"),
		messages: await convertToModelMessages(messages, {
			ignoreIncompleteToolCalls: true,
		}),
	});

	return result.toUIMessageStreamResponse();
}
