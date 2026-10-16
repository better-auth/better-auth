import { latestVersion } from "@/lib/docs-versions";
import { getDocsLLMsIndexUrl, getLLMsIndex } from "@/lib/llm-text";
import { createMarkdownResponse } from "@/lib/markdown-response";
import { getSourceFor } from "@/lib/source";

export const dynamic = "force-static";

export function GET() {
	return createMarkdownResponse(
		getLLMsIndex(getSourceFor(latestVersion.id), latestVersion),
		{
			headers: {
				Link: `<${getDocsLLMsIndexUrl(latestVersion)}>; rel="canonical"`,
			},
		},
	);
}
