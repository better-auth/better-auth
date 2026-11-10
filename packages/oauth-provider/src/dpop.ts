import type { GenericEndpointContext } from "@better-auth/core";
import { NO_STORE_HEADERS } from "better-auth/api";
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

const dpopRequestTimes = new WeakMap<object, number>();

/**
 * The time, in epoch seconds, that this request's DPoP proof and nonce are
 * checked against. The first call captures it, and later calls for the same
 * request reuse it. The token endpoint's nonce check before the grant runs and
 * the proof verification at issuance therefore agree. A nonce that expires
 * while the grant consumes its code does not fail the request after the code
 * is gone.
 */
export function getDpopRequestTime(
	ctx: Pick<GenericEndpointContext, "context">,
): number {
	let seconds = dpopRequestTimes.get(ctx);
	if (seconds === undefined) {
		seconds = Math.floor(Date.now() / 1000);
		dpopRequestTimes.set(ctx, seconds);
	}
	return seconds;
}

/**
 * Adds `headers` to a comma-separated `Access-Control-Expose-Headers` value,
 * keeping the names already listed.
 */
export function withExposedHeaders(
	exposed: string | null | undefined,
	...headers: string[]
): string {
	const names = (exposed ?? "")
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	for (const header of headers) {
		if (!names.some((name) => name.toLowerCase() === header.toLowerCase())) {
			names.push(header);
		}
	}
	return names.join(", ");
}

/**
 * Sends a fresh `DPoP-Nonce` on this response (RFC 9449 §8, §8.2), forbids
 * caching the response so a cache cannot hand out an expired nonce, and
 * exposes the nonce to cross-origin browser clients. A challenge also exposes
 * `WWW-Authenticate`, which browsers hide by default, so the client can see
 * that it must retry with the nonce. Returns the headers it set, so an error
 * thrown afterwards can carry them too.
 */
export async function setDpopNonceHeader(
	ctx: Pick<GenericEndpointContext, "setHeader" | "responseHeaders">,
	nonce: DpopNonceOptions,
	options?: { challenge?: boolean },
): Promise<Record<string, string>> {
	const headers: Record<string, string> = {
		...NO_STORE_HEADERS,
		[DPOP_NONCE_HEADER]: await createDpopNonce({ secret: nonce.secret }),
		"Access-Control-Expose-Headers": withExposedHeaders(
			ctx.responseHeaders?.get("access-control-expose-headers"),
			DPOP_NONCE_HEADER,
			...(options?.challenge ? ["WWW-Authenticate"] : []),
		),
	};
	for (const [name, value] of Object.entries(headers)) {
		ctx.setHeader(name, value);
	}
	return headers;
}
