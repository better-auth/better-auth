import type { InferPageType } from "fumadocs-core/source";
import { notFound } from "next/navigation";
import { source } from "@/lib/source";

export const revalidate = false;

async function getLLMText(page: InferPageType<typeof source>) {
	const content = await page.data.getText("raw");
	return `# ${page.data.title}\n\nURL: ${page.url}\n\n${content}`;
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	const { slug } = await params;
	const page = source.getPage(slug);
	if (!page) notFound();

	return new Response(await getLLMText(page), {
		headers: { "Content-Type": "text/markdown" },
	});
}

export function generateStaticParams() {
	return source.generateParams();
}
