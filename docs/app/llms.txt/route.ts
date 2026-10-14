import { docsVersions } from "@/lib/docs-versions";
import { getRootLLMsIndex } from "@/lib/llm-text";
import { createMarkdownResponse } from "@/lib/markdown-response";

export const dynamic = "force-static";

export function GET() {
	return createMarkdownResponse(getRootLLMsIndex(docsVersions));
}
