import { llms } from "fumadocs-core/source";
import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
	docsVersions,
	resolveVersionFromSlug,
} from "../../../lib/docs-versions";
import {
	getLLMsIndexOptions,
	getLLMText,
	LLM_TEXT_ERROR,
	normalizeLLMsSlug,
	rewriteLLMsIndexLinks,
} from "../../../lib/llm-text";
import { getSourceFor } from "../../../lib/source";

export const revalidate = false;

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ slug: string[] }> },
) {
	const slug = normalizeLLMsSlug((await params).slug);
	const versionIndex = docsVersions.find(
		(version) => version.id !== "latest" && version.id === slug[0],
	);
	if (versionIndex && slug.length === 1) {
		return new NextResponse(
			rewriteLLMsIndexLinks(
				llms(
					getSourceFor(versionIndex.id),
					getLLMsIndexOptions(versionIndex),
				).index(),
			),
			{
				status: 200,
				headers: { "Content-Type": "text/markdown; charset=utf-8" },
			},
		);
	}

	const { version, relSlug } = resolveVersionFromSlug(slug);
	const page = getSourceFor(version.id).getPage(relSlug);
	if (!page) notFound();

	try {
		const content = await getLLMText(page, version);
		return new NextResponse(content, {
			status: 200,
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		});
	} catch (error) {
		console.error("Error generating LLM text:", error);
		return new NextResponse(LLM_TEXT_ERROR, {
			status: 500,
			headers: { "Content-Type": "text/markdown; charset=utf-8" },
		});
	}
}

export function generateStaticParams() {
	return docsVersions.flatMap((v) => {
		const src = getSourceFor(v.id);
		const pageParams = src.generateParams().map((p) => ({
			slug: v.id !== "latest" ? [v.id, ...(p.slug ?? [])] : (p.slug ?? []),
		}));
		return v.id !== "latest" ? [{ slug: [v.id] }, ...pageParams] : pageParams;
	});
}
