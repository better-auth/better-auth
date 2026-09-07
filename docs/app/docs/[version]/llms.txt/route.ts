import { docsVersions, getVersionById } from "@/lib/docs-versions";
import {
	getDocsLLMsIndexUrl,
	getLLMNotFound,
	getLLMsIndex,
} from "@/lib/llm-text";
import { createMarkdownResponse } from "@/lib/markdown-response";
import { getSourceFor } from "@/lib/source";

export const dynamic = "force-static";

export async function GET(
	_request: Request,
	{ params }: RouteContext<"/docs/[version]/llms.txt">,
) {
	const { version: versionId } = await params;
	const version = getVersionById(versionId);
	if (!version || version.id === "latest") {
		return createMarkdownResponse(
			getLLMNotFound(`/docs/${versionId}/llms.txt`),
			{ status: 404 },
		);
	}
	return createMarkdownResponse(
		getLLMsIndex(getSourceFor(version.id), version),
		{
			headers: {
				Link: `<${getDocsLLMsIndexUrl(version)}>; rel="canonical"`,
			},
		},
	);
}

export function generateStaticParams() {
	return docsVersions
		.filter((version) => version.id !== "latest")
		.map((version) => ({ version: version.id }));
}
