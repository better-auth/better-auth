import { getVersionById } from "@/lib/docs-versions";
import { getLLMNotFound } from "@/lib/llm-text";
import { createMarkdownResponse } from "@/lib/markdown-response";

// Redirect URLs published by the legacy `/llms.txt` index.
function getLegacyMarkdownTarget(slug: string[]) {
	if (slug.length === 1) {
		const version = getVersionById(slug[0]);
		if (version && version.id !== "latest") {
			return `/docs/${version.id}/llms.txt`;
		}
	}

	if (!slug.at(-1)?.endsWith(".md")) return null;

	return slug[0] === "docs" ? `/${slug.join("/")}` : `/docs/${slug.join("/")}`;
}

export async function GET(
	request: Request,
	{ params }: RouteContext<"/llms.txt/[...slug]">,
) {
	const slug = (await params).slug;
	const target = getLegacyMarkdownTarget(slug);
	if (!target) {
		return createMarkdownResponse(
			getLLMNotFound(`/llms.txt/${slug.join("/")}`),
			{ status: 404 },
		);
	}

	const redirectUrl = new URL(request.url);
	redirectUrl.pathname = target;
	return Response.redirect(redirectUrl, 308);
}
