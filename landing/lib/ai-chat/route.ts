import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import * as z from "zod";
import { getLLMText } from "@/lib/llm-text";
import { source } from "@/lib/source";
import { checkRateLimit, getClientIP } from "./rate-limit";

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});
const chatModel = openrouter.chat("anthropic/claude-sonnet-4");

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

type SearchEntry = {
	slug: string;
	title: string;
	description: string;
	headings: string[];
	contents: { heading: string | undefined; content: string }[];
};

let cachedSearchIndex: SearchEntry[] | null = null;
async function getSearchIndex(): Promise<SearchEntry[]> {
	if (cachedSearchIndex) return cachedSearchIndex;

	const pages = source.getPages();
	const entries: SearchEntry[] = [];

	await Promise.all(
		pages
			.filter((p) => p.slugs[0] !== "openapi")
			.map(async (page) => {
				try {
					const loaded = await page.data.load();
					entries.push({
						slug: page.slugs.join("/"),
						title: page.data.title,
						description: page.data.description ?? "",
						headings: loaded.structuredData.headings.map(
							(h: { content: string }) => h.content,
						),
						contents: loaded.structuredData.contents,
					});
				} catch {
					// skip pages that fail to load
				}
			}),
	);

	cachedSearchIndex = entries;
	return entries;
}

const MAX_SEARCH_RESULTS = 10;
const MAX_SNIPPET_LENGTH = 200;

function searchIndex(entries: SearchEntry[], query: string) {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [];

	const scored: { entry: SearchEntry; score: number; snippets: string[] }[] =
		[];

	for (const entry of entries) {
		let score = 0;
		const snippets: string[] = [];
		const titleLower = entry.title.toLowerCase();
		const descLower = entry.description.toLowerCase();

		for (const term of terms) {
			if (titleLower.includes(term)) score += 10;
			if (descLower.includes(term)) score += 5;
		}

		for (const h of entry.headings) {
			const lower = h.toLowerCase();
			for (const term of terms) {
				if (lower.includes(term)) score += 3;
			}
		}

		for (const section of entry.contents) {
			const lower = section.content.toLowerCase();
			const matches = terms.filter((t) => lower.includes(t));
			if (matches.length > 0) {
				score += matches.length * 2;
				const firstMatch = lower.indexOf(matches[0]);
				const start = Math.max(0, firstMatch - 60);
				const snippet = section.content.slice(
					start,
					start + MAX_SNIPPET_LENGTH,
				);
				const heading = section.heading ? `[${section.heading}] ` : "";
				snippets.push(`${heading}...${snippet}...`);
			}
		}

		if (score > 0) {
			scored.push({ entry, score, snippets: snippets.slice(0, 3) });
		}
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, MAX_SEARCH_RESULTS);
}

const SYSTEM_PROMPT = `You are a helpful documentation assistant for Better Auth, a comprehensive framework-agnostic authentication and authorization framework for TypeScript.

Your role is to answer questions about Better Auth by referencing the official documentation. You should be accurate, concise, and helpful.

## Rules
- Always look up relevant documentation before answering. Do NOT guess or make up information.
- Use searchDocs when you're unsure which page has the answer, then use getDocumentation to read the matching pages.
- You may call the tools multiple times to gather context from different pages.
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
			searchDocs: tool({
				description:
					"Search across all Better Auth documentation for specific terms, keywords, or concepts. Returns matching page slugs and snippets. Use this when you're not sure which page contains the answer.",
				inputSchema: z.object({
					query: z
						.string()
						.describe(
							"Search query — keywords or terms to find, e.g. 'session token cookie' or 'organization invite'",
						),
				}),
				execute: async ({ query }) => {
					const index = await getSearchIndex();
					const results = searchIndex(index, query);
					if (results.length === 0) {
						return { results: [], message: "No matching documentation found." };
					}
					return {
						results: results.map((r) => ({
							slug: r.entry.slug,
							title: r.entry.title,
							description: r.entry.description,
							snippets: r.snippets,
						})),
					};
				},
			}),
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
