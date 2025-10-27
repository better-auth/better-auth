import { type NextRequest, NextResponse } from "next/server";
import { source } from "@/lib/source";
import { notFound } from "next/navigation";
import { getLLMText } from "@/app/docs/lib/get-llm-text";

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

	const content = await getLLMText(page);

	return new NextResponse(content, {
		headers: {
			"Content-Type": "text/markdown",
		},
	});
}

export function generateStaticParams() {
	return source.generateParams();
}
