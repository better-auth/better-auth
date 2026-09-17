import { docsVersions, resolveVersionFromSlug } from "@/lib/docs-versions";
import {
	getDocsLLMsIndexUrl,
	getLLMNotFound,
	getLLMText,
} from "@/lib/llm-text";
import { createNegotiatedMarkdownResponse } from "@/lib/markdown-response";
import { getSourceFor } from "@/lib/source";

export const dynamic = "force-static";

export async function GET(
	_request: Request,
	{ params }: RouteContext<"/llms.mdx/[[...slug]]">,
) {
	const slug = (await params).slug ?? [];
	const { version, relSlug } = resolveVersionFromSlug(slug);
	const page = getSourceFor(version.id).getPage(relSlug);

	if (!page) {
		const requestedPath = `/docs${slug.length > 0 ? `/${slug.join("/")}` : ""}.md`;
		return createNegotiatedMarkdownResponse(getLLMNotFound(requestedPath), {
			status: 404,
		});
	}

	return createNegotiatedMarkdownResponse(await getLLMText(page, version), {
		headers: {
			Link: `<${page.url}>; rel="canonical", <${getDocsLLMsIndexUrl(version)}>; rel="describedby"`,
		},
	});
}

export function generateStaticParams() {
	return docsVersions.flatMap((version) =>
		getSourceFor(version.id)
			.generateParams()
			.map(({ slug }) => ({
				slug:
					version.id === "latest"
						? (slug ?? [])
						: [version.id, ...(slug ?? [])],
			})),
	);
}
