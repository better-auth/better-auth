import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLLMText, LLM_TEXT_ERROR } from "@/lib/llm-text";
import { source } from "@/lib/source";

export const revalidate = false;

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	let slug = (await params).slug;

	// Remove .md extension if present in the last segment
	if (slug[slug.length - 1]?.endsWith(".md")) {
		slug = [...slug.slice(0, -1), slug[slug.length - 1].replace(/\.md$/, "")];
	}

	// Remove 'docs' prefix if present (since source already includes /docs in baseUrl)
	if (slug[0] === "docs") {
		slug = slug.slice(1);
	}

	const page = source.getPage(slug);
	if (!page) notFound();

	try {
		const content = await getLLMText(page);
		return new NextResponse(content, {
			status: 200,
			headers: { "Content-Type": "text/markdown" },
		});
	} catch (error) {
		console.error("Error generating LLM text:", error);
		return new NextResponse(LLM_TEXT_ERROR, {
			status: 500,
			headers: { "Content-Type": "text/markdown" },
		});
	}
}

export function generateStaticParams() {
	return source.generateParams();
}
