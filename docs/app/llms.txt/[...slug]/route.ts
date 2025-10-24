import { notFound } from "next/navigation";
import { type NextRequest, NextResponse } from "next/server";
import { getLLMText } from "@/app/docs/lib/get-llm-text";
import { source } from "@/lib/source";

export const revalidate = false;

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	const slug = (await params).slug;
	const page = source.getPage(slug);
	if (!page) notFound();

	return new NextResponse(await getLLMText(page), {
		headers: {
			"Content-Type": "text/markdown",
		},
	});
}

export function generateStaticParams() {
	return source.generateParams();
}
