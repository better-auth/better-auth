import { getPrimitives } from "./primitives";
import { getRuntime } from "./runtime";
import { getStyles } from "./styles";

export interface PageOptions {
	title?: string;
	/** The auth API base path, e.g. "/api/auth" */
	apiBasePath: string;
	body: string;
	/** Extra <head> content */
	head?: string;
}

/**
 * Render a full HTML page with the Better Auth UI styles and thin client runtime.
 */
export function renderPage(opts: PageOptions): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${opts.title ? `${opts.title} - Better Auth` : "Better Auth"}</title>
<style>${getStyles()}</style>
${opts.head || ""}
</head>
<body>
${opts.body}
<script>${getRuntime(opts.apiBasePath)}</script>
<script>${getPrimitives()}</script>
</body>
</html>`;
}

/**
 * Create a Response from HTML (full page or fragment).
 */
export function htmlResponse(html: string, status: number = 200): Response {
	return new Response(html, {
		status,
		headers: { "Content-Type": "text/html; charset=utf-8" },
	});
}
