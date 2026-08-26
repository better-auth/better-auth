import { llms } from "fumadocs-core/source";
import { docsVersions } from "@/lib/docs-versions";
import { getLLMsIndexOptions, rewriteLLMsIndexLinks } from "@/lib/llm-text";
import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
	const archivedVersions = docsVersions
		.filter((version) => version.id !== "latest")
		.map((version) => `- [${version.label}](/llms.txt/${version.id})`)
		.join("\n");
	const content = [
		rewriteLLMsIndexLinks(llms(source, getLLMsIndexOptions()).index()),
		"## Other Versions",
		archivedVersions,
	].join("\n\n");

	return new Response(content, {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
