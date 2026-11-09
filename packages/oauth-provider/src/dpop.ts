import type { GenericEndpointContext } from "@better-auth/core";

export function getDpopProofJwt(
	ctx: Pick<GenericEndpointContext, "headers">,
): string | undefined {
	return ctx.headers?.get("dpop") ?? undefined;
}

/**
 * The endpoint's public URL, which clients use as the DPoP `htu`: the origin
 * and base path of `baseURL` (not `request.url`, whose host proxies and dev
 * servers can rewrite) plus the request's own path below the base path, so
 * route params and a trailing slash match what the client called. `path` is
 * used when there is no HTTP request, such as an `auth.api` call.
 */
export function getEndpointUrl(
	ctx: Pick<GenericEndpointContext, "context" | "request">,
	path: string,
): string {
	const { baseURL } = ctx.context;
	let end = baseURL.length;
	// A loop, not `/\/+$/`, which backtracks quadratically on runs of slashes.
	while (end > 0 && baseURL[end - 1] === "/") end--;
	const base = baseURL.slice(0, end);
	// `baseURL` stays empty when nothing configures it and no request set it.
	if (!ctx.request || !base) return `${base}${path}`;
	const basePath = new URL(base).pathname.replace(/\/$/, "");
	const requestPath = new URL(ctx.request.url).pathname;
	const endpointPath = requestPath.startsWith(`${basePath}/`)
		? requestPath.slice(basePath.length)
		: path;
	return `${base}${endpointPath}`;
}
