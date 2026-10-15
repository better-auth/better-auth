import type { GenericEndpointContext } from "@better-auth/core";

export function getDpopProofJwt(
	ctx: Pick<GenericEndpointContext, "headers">,
): string | undefined {
	return ctx.headers?.get("dpop") ?? undefined;
}

/**
 * The endpoint's public URL, built from `baseURL`, which clients use as the
 * DPoP `htu`. Not `request.url`: proxies and dev servers can rewrite its host.
 */
export function getEndpointUrl(
	ctx: Pick<GenericEndpointContext, "context">,
	path: string,
): string {
	const { baseURL } = ctx.context;
	let end = baseURL.length;
	// A loop, not `/\/+$/`, which backtracks quadratically on runs of slashes.
	while (end > 0 && baseURL[end - 1] === "/") end--;
	return `${baseURL.slice(0, end)}${path}`;
}
