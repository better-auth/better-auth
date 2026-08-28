export function createMarkdownResponse(
	content: string,
	init: ResponseInit = {},
) {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "text/markdown; charset=utf-8");
	return new Response(content, { ...init, headers });
}

export function createNegotiatedMarkdownResponse(
	content: string,
	init: ResponseInit = {},
) {
	const headers = new Headers(init.headers);
	headers.set("Vary", "Accept");
	return createMarkdownResponse(content, { ...init, headers });
}
