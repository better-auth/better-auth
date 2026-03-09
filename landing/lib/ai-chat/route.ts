import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import * as z from "zod";
import { getLLMText } from "@/lib/llm-text";
import { source } from "@/lib/source";
import { checkRateLimit, getClientIP } from "./rate-limit";

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});
const chatModel = openrouter.chat("moonshotai/kimi-k2.5");

function buildDocsIndex(): string {
	const pages = source.getPages();
	const lines: string[] = [];

	for (const page of pages) {
		if (page.slugs[0] === "openapi") continue;
		const slug = page.slugs.join("/");
		const desc = page.data.description ? ` - ${page.data.description}` : "";
		lines.push(`- ${page.data.title} [${slug}]${desc}`);
	}

	return lines.join("\n");
}

let cachedDocsIndex: string | null = null;
function getDocsIndex(): string {
	if (!cachedDocsIndex) {
		cachedDocsIndex = buildDocsIndex();
	}
	return cachedDocsIndex;
}

const SYSTEM_PROMPT = `You are a helpful documentation assistant for Better Auth, a comprehensive framework-agnostic authentication and authorization framework for TypeScript.

Your role is to answer questions about Better Auth by referencing the official documentation. You should be accurate, concise, and helpful.

## Rules
- Always use the getDocumentation tool to look up relevant documentation before answering. Do NOT guess or make up information.
- You may call the tool multiple times to gather context from different pages.
- When referencing configuration options, APIs, or code, be precise and use the exact names from the documentation.
- If the documentation doesn't cover the user's question, say so honestly rather than guessing.
- Format your answers with markdown. Use code blocks for code examples.
- Keep answers focused and concise - ideally under 400 words. Don't dump entire pages of documentation; extract only the relevant parts.
- Provide short code snippets, not full files. Only show the minimum code needed to illustrate the answer.

## Available Documentation Pages
The following pages are available. Use the slug (in brackets) with the getDocumentation tool to retrieve the full content of a page.

`;

export async function POST(req: Request) {
	const ip = getClientIP(req);
	const rateLimitResult = await checkRateLimit(ip);

	if (!rateLimitResult.success) {
		const retryAfter = Math.ceil((rateLimitResult.reset - Date.now()) / 1000);
		return new Response(
			JSON.stringify({
				error: "Rate limit exceeded. Please try again later.",
			}),
			{
				status: 429,
				headers: {
					"Content-Type": "application/json",
					"Retry-After": String(Math.max(retryAfter, 1)),
					"X-RateLimit-Limit": String(rateLimitResult.limit),
					"X-RateLimit-Remaining": String(rateLimitResult.remaining),
					"X-RateLimit-Reset": String(rateLimitResult.reset),
				},
			},
		);
	}

	const { messages } = await req.json();
	const docsIndex = getDocsIndex();

	const system = SYSTEM_PROMPT + docsIndex;

	const result = streamText({
		model: chatModel,
		maxOutputTokens: 2048,
		system,
		messages: await convertToModelMessages(messages, {
			ignoreIncompleteToolCalls: true,
		}),
		tools: {
			getDocumentation: tool({
				description:
					"Retrieve the full content of a Better Auth documentation page by its slug. Use this to look up detailed information before answering user questions.",
				inputSchema: z.object({
					slug: z
						.string()
						.describe(
							"The documentation page slug, e.g. 'plugins/passkey' or 'concepts/session-management'",
						),
				}),
				execute: async ({ slug }) => {
					const slugParts = slug.split("/");
					const page = source.getPage(slugParts);
					if (!page) {
						return { error: `Documentation page not found for slug: ${slug}` };
					}
					try {
						const content = await getLLMText(page);
						return { content };
					} catch {
						return {
							error: `Failed to load documentation for: ${slug}`,
						};
					}
				},
			}),
		},
		stopWhen: stepCountIs(5),
	});

	return result.toUIMessageStreamResponse();
}
