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

const GITHUB_REPO = "better-auth/better-auth";
const GITHUB_API = "https://api.github.com";
const MAX_CODE_SEARCH_RESULTS = 8;
const MAX_FILE_CONTENT_LENGTH = 12_000;

type GitHubTextMatch = {
	fragment: string;
	matches: { text: string; indices: number[] }[];
};

type GitHubSearchItem = {
	name: string;
	path: string;
	html_url: string;
	repository: { full_name: string };
	text_matches?: GitHubTextMatch[];
};

function githubHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github.text-match+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (process.env.GITHUB_TOKEN) {
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	}
	return headers;
}

async function githubSearchCode(query: string, path?: string) {
	let q = `${query} repo:${GITHUB_REPO}`;
	if (path) {
		q += ` path:${path}`;
	}

	const url = new URL(`${GITHUB_API}/search/code`);
	url.searchParams.set("q", q);
	url.searchParams.set("per_page", String(MAX_CODE_SEARCH_RESULTS));

	const res = await fetch(url.toString(), { headers: githubHeaders() });
	if (!res.ok) {
		let text: string | undefined;
		try {
			text = await res.text();
		} catch {
			// ignore
		}
		console.error("[ai-chat] GitHub search error", {
			status: res.status,
			statusText: res.statusText,
			body: text,
		});
		return { error: "GitHub search is temporarily unavailable." };
	}

	const data = (await res.json()) as {
		total_count: number;
		items: GitHubSearchItem[];
	};

	return {
		total_count: data.total_count,
		results: data.items.map((item) => ({
			path: item.path,
			url: item.html_url,
			fragments: (item.text_matches ?? []).map((m) => m.fragment),
		})),
	};
}

async function githubGetFileContent(path: string, ref = "canary") {
	const url = `${GITHUB_API}/repos/${GITHUB_REPO}/contents/${encodeURIComponent(path)}?ref=${ref}`;

	const res = await fetch(url, {
		headers: {
			Accept: "application/vnd.github.raw+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...(process.env.GITHUB_TOKEN
				? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
				: {}),
		},
	});

	if (!res.ok) {
		console.error("[ai-chat] GitHub file fetch error", {
			path,
			ref,
			status: res.status,
			statusText: res.statusText,
		});
		return {
			error: "Unable to fetch that file right now.",
		};
	}

	let content = await res.text();
	if (content.length > MAX_FILE_CONTENT_LENGTH) {
		content = `${content.slice(0, MAX_FILE_CONTENT_LENGTH)}\n\n... (truncated — file exceeds ${MAX_FILE_CONTENT_LENGTH} chars)`;
	}
	return { path, content };
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
- When users ask about implementation details, internal behavior, or source code, use searchCode and getFileContent to look up the actual source code from the GitHub repository.

## Available Documentation Pages
The following pages are available. Use the slug (in brackets) with the getDocumentation tool to retrieve the full content of a page.

`;

export async function POST(req: Request) {
	const errorId = crypto.randomUUID();

	try {
		const ip = getClientIP(req);
		const rateLimitResult = await checkRateLimit(ip);

		if (!rateLimitResult.success) {
			const retryAfter = Math.ceil(
				(rateLimitResult.reset - Date.now()) / 1000,
			);
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

		let body: unknown;
		try {
			body = await req.json();
		} catch (err) {
			console.error(`[ai-chat] invalid JSON body (${errorId})`, err);
			return new Response(JSON.stringify({ error: "Invalid request." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const messages = (body as { messages?: unknown } | null | undefined)
			?.messages;
		if (!Array.isArray(messages) || messages.length === 0) {
			return new Response(JSON.stringify({ error: "Invalid request." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}
		if (messages.length > 100) {
			return new Response(JSON.stringify({ error: "Invalid request." }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

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
							return {
								results: [],
								message: "No matching documentation found.",
							};
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
							return {
								error: `Documentation page not found for slug: ${slug}`,
							};
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
				searchCode: tool({
					description:
						"Search the Better Auth source code on GitHub using semantic code search. Returns matching file paths and code fragments. Use this when users ask about implementation details, internal behavior, or want to see actual source code.",
					inputSchema: z.object({
						query: z
							.string()
							.describe(
								"Code search query — function names, class names, keywords, or concepts to find in the source, e.g. 'createSession' or 'hashPassword' or 'organization plugin'",
							),
						path: z
							.string()
							.optional()
							.describe(
								"Optional path filter to narrow search to a directory or file pattern, e.g. 'packages/better-auth/src' or 'packages/cli'",
							),
					}),
					execute: async ({ query, path }) => {
						return githubSearchCode(query, path);
					},
				}),
				getFileContent: tool({
					description:
						"Fetch the content of a specific file from the Better Auth GitHub repository. Use this after searchCode to read the full source of a matching file.",
					inputSchema: z.object({
						path: z
							.string()
							.describe(
								"The file path in the repository, e.g. 'packages/better-auth/src/api/routes/session.ts'",
							),
					}),
					execute: async ({ path }) => {
						return githubGetFileContent(path);
					},
				}),
			},
			stopWhen: stepCountIs(8),
		});

		return result.toUIMessageStreamResponse();
	} catch (err) {
		console.error(`[ai-chat] unhandled error (${errorId})`, err);
		return new Response(
			JSON.stringify({
				error: "Something went wrong. Please try again.",
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}
}
