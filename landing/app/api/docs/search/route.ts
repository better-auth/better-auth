interface SearchResult {
	id: string;
	url: string;
	type: "page" | "heading" | "text";
	content: string;
	pageName?: string;
}

interface InkeepDocument {
	type: string;
	record_type: string;
	url: string;
	title: string;
	source?: {
		type: string;
		content: { type: string; text?: string }[];
	};
}

function toSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.trim();
}

function toRelativePath(fullUrl: string): string {
	try {
		const parsed = new URL(fullUrl);
		return parsed.pathname;
	} catch {
		return fullUrl;
	}
}

function extractHeadings(text: string): { level: number; title: string }[] {
	const headings: { level: number; title: string }[] = [];
	const regex = /^(#{1,6})\s+(.+)$/gm;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		headings.push({
			level: match[1].length,
			title: match[2].trim(),
		});
	}
	return headings;
}

function extractMatchingSnippet(text: string, query: string): string | null {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

	// Find the first paragraph-like block that contains a query term
	const blocks = text.split(/\n{2,}/);
	for (const block of blocks) {
		const blockLower = block.toLowerCase();
		// Skip headings and very short blocks
		if (block.startsWith("#") || block.trim().length < 20) continue;
		if (terms.some((t) => blockLower.includes(t))) {
			// Return a trimmed snippet
			const clean = block.replace(/[#*_`>\[\]]/g, "").trim();
			if (clean.length > 120) return `${clean.slice(0, 120)}...`;
			return clean;
		}
	}
	return null;
}

export async function GET(request: Request) {
	const url = new URL(request.url);
	const query = url.searchParams.get("query");
	if (!query) return Response.json([]);

	try {
		const response = await fetch("https://api.inkeep.com/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.INKEEP_API_KEY}`,
			},
			body: JSON.stringify({
				model: "inkeep-rag",
				messages: [{ role: "user", content: query }],
				response_format: { type: "json_object" },
			}),
		});

		if (!response.ok) {
			console.error("Inkeep RAG API error:", response.status);
			return Response.json([]);
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;
		if (!content) return Response.json([]);

		const parsed = JSON.parse(content);
		const documents: InkeepDocument[] = parsed.content ?? [];

		const results: SearchResult[] = [];
		const seenUrls = new Set<string>();

		for (const doc of documents) {
			const docUrl = toRelativePath(doc.url);

			// Add page-level result (dedupe by base URL)
			const baseUrl = docUrl.split("#")[0];
			if (!seenUrls.has(baseUrl)) {
				seenUrls.add(baseUrl);
				results.push({
					id: baseUrl,
					url: baseUrl,
					type: "page",
					content: doc.title,
				});
			}

			// Extract full text from source content blocks
			const fullText = (doc.source?.content ?? [])
				.filter((c) => c.type === "text" && c.text)
				.map((c) => c.text!)
				.join("\n\n");

			if (!fullText) continue;

			// Extract headings and add as section results
			const headings = extractHeadings(fullText);
			const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

			for (const heading of headings) {
				const headingLower = heading.title.toLowerCase();
				const matches = queryTerms.some((t) => headingLower.includes(t));
				if (!matches) continue;

				const slug = toSlug(heading.title);
				const headingUrl = `${baseUrl}#${slug}`;
				if (seenUrls.has(headingUrl)) continue;
				seenUrls.add(headingUrl);

				results.push({
					id: headingUrl,
					url: headingUrl,
					type: "heading",
					content: heading.title,
					pageName: doc.title,
				});
			}

			// Add a text snippet match if we find relevant content
			const snippet = extractMatchingSnippet(fullText, query);
			if (snippet) {
				const snippetId = `${baseUrl}:snippet`;
				if (!seenUrls.has(snippetId)) {
					seenUrls.add(snippetId);

					// Link to the closest heading above the snippet, or the page
					let bestAnchor = baseUrl;
					for (const heading of headings) {
						const slug = toSlug(heading.title);
						bestAnchor = `${baseUrl}#${slug}`;
					}

					results.push({
						id: snippetId,
						url: bestAnchor,
						type: "text",
						content: snippet,
						pageName: doc.title,
					});
				}
			}
		}

		return Response.json(results.slice(0, 20));
	} catch (error) {
		console.error("Search error:", error);
		return Response.json([]);
	}
}
