import type { GenericEndpointContext } from "@better-auth/core";
import type { DpopNonceOptions } from "better-auth/oauth2";
import { createDpopNonce, DPOP_NONCE_HEADER } from "better-auth/oauth2";
import type { OAuthOptions, Scope } from "./types";

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

/**
 * The nonce settings for this server's DPoP endpoints, or `undefined` when
 * `dpop.nonce.required` is off. Nonces are keyed from the auth secret, so every
 * endpoint on this origin, and every instance sharing the secret, accepts them.
 */
export function getDpopNonceOptions(
	ctx: Pick<GenericEndpointContext, "context">,
	opts: Pick<OAuthOptions<Scope[]>, "dpop">,
): DpopNonceOptions | undefined {
	if (!opts.dpop?.nonce?.required) return undefined;
	return {
		secret: ctx.context.secret,
		expiresIn: opts.dpop.nonce.expiresIn,
	};
}

/**
 * Adds `header` to a comma-separated `Access-Control-Expose-Headers` value,
 * keeping the names already listed.
 */
export function withExposedHeader(
	exposed: string | null | undefined,
	header: string,
): string {
	const names = (exposed ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (!names.some((name) => name.toLowerCase() === header.toLowerCase())) {
		names.push(header);
	}
	return names.join(", ");
}

/**
 * Sends a fresh `DPoP-Nonce` on this response (RFC 9449 §8, §8.2) and exposes
 * it to cross-origin browser clients. Returns the headers it set, so an error
 * thrown afterwards can carry them too.
 */
export async function setDpopNonceHeader(
	ctx: Pick<GenericEndpointContext, "setHeader" | "responseHeaders">,
	nonce: DpopNonceOptions,
): Promise<Record<string, string>> {
	const headers = {
		[DPOP_NONCE_HEADER]: await createDpopNonce({ secret: nonce.secret }),
		"Access-Control-Expose-Headers": withExposedHeader(
			ctx.responseHeaders?.get("access-control-expose-headers"),
			DPOP_NONCE_HEADER,
		),
	};
	for (const [name, value] of Object.entries(headers)) {
		ctx.setHeader(name, value);
	}
	return headers;
}
