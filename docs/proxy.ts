import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const { rewrite: rewriteMarkdownPath } = rewritePath(
	"/docs{/*path}.md{x}",
	"/llms.mdx{/*path}",
);
const { rewrite: rewriteDocsPath } = rewritePath(
	"/docs/*path",
	"/llms.mdx/*path",
);

function createRewriteUrl(request: NextRequest, pathname: string) {
	const url = request.nextUrl.clone();
	url.pathname = pathname;
	return url;
}

export function proxy(request: NextRequest) {
	const pathname = request.nextUrl.pathname;
	const markdownPath = rewriteMarkdownPath(pathname);
	if (markdownPath) {
		return NextResponse.rewrite(createRewriteUrl(request, markdownPath));
	}

	if (!pathname.endsWith(".txt") && isMarkdownPreferred(request)) {
		const rewrittenPath = rewriteDocsPath(pathname);
		if (rewrittenPath) {
			return NextResponse.rewrite(createRewriteUrl(request, rewrittenPath));
		}
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/docs/:path*"],
};
