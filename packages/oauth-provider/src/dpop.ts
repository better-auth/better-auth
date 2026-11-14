import type { GenericEndpointContext } from "@better-auth/core";
import { defineRequestState, hasRequestState } from "@better-auth/core/context";
import { assertDpopProofNonce } from "@better-auth/core/oauth2/internal";
import { APIError, NO_STORE_HEADERS } from "better-auth/api";
import type {
	DpopNonceOptions,
	DpopReplayStore,
	VerifiedDpopProof,
} from "better-auth/oauth2";
import {
	createDpopNonce,
	createDpopReplayStore,
	DPOP_NONCE_HEADER,
	isDpopProofError,
	verifyDpopProof,
} from "better-auth/oauth2";
import type { OAuthOptions, Scope } from "./types";
import { getAuthEndpointUrl } from "./utils";

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
	const base = getAuthEndpointUrl(ctx, "");
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

const dpopRequestTime = defineRequestState(() => Math.floor(Date.now() / 1000));

/**
 * The time, in epoch seconds, that this request's DPoP proof and nonce are
 * checked against. The first call captures it, and later calls in the same
 * request, before hooks included, reuse it. A nonce that passes the check
 * before a grant consumes its code therefore cannot expire before the proof is
 * verified at issuance.
 */
async function getDpopRequestTime(): Promise<number> {
	if (!(await hasRequestState())) return Math.floor(Date.now() / 1000);
	return dpopRequestTime.get();
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

export function throwInvalidDpopProof(errorDescription: string): never {
	throw new APIError("BAD_REQUEST", {
		error: "invalid_dpop_proof",
		error_description: errorDescription,
	});
}

/**
 * RFC 9449 §8: answers a request whose DPoP proof lacks a current nonce with
 * `use_dpop_nonce` and the nonce to retry with.
 */
async function throwUseDpopNonce(
	ctx: Pick<GenericEndpointContext, "setHeader" | "responseHeaders">,
	nonce: DpopNonceOptions,
	errorDescription: string,
): Promise<never> {
	throw new APIError(
		"BAD_REQUEST",
		{ error: "use_dpop_nonce", error_description: errorDescription },
		await setDpopNonceHeader(ctx, nonce),
	);
}

/**
 * Verifies a DPoP proof sent to an authorization-server endpoint with this
 * server's DPoP settings, answering failures with RFC 9449 §8 errors and a
 * verified proof with the client's next nonce (§8.2).
 */
export async function verifyRequestDpopProof(
	ctx: GenericEndpointContext,
	opts: Pick<OAuthOptions<Scope[]>, "dpop">,
	params: {
		proofJwt: string;
		method: string;
		url: string;
		expectedJkt?: string;
		/** Defaults to the database-backed store. */
		replayStore?: DpopReplayStore;
	},
): Promise<VerifiedDpopProof> {
	const nonce = getDpopNonceOptions(ctx, opts);
	const { replayStore, ...proofParams } = params;
	let proof: VerifiedDpopProof;
	try {
		proof = await verifyDpopProof({
			...proofParams,
			proofMaxAgeSeconds: opts.dpop?.proofMaxAgeSeconds,
			signingAlgorithms: opts.dpop?.signingAlgorithms,
			replayStore: replayStore ?? createDpopReplayStore(ctx.context),
			nonce,
			// The time the request arrived, which the token endpoint's nonce check
			// also used, not the time a grant reaches issuance.
			nowSeconds: await getDpopRequestTime(),
		});
	} catch (error) {
		if (isDpopProofError(error)) {
			if (error.code === "use_dpop_nonce" && nonce) {
				await throwUseDpopNonce(ctx, nonce, error.message);
			}
			throwInvalidDpopProof(error.message);
		}
		throw error;
	}
	if (nonce) await setDpopNonceHeader(ctx, nonce);
	return proof;
}

/**
 * Verifies the request's DPoP proof for a plugin endpoint on the authorization
 * server. Backs `OAuthProviderApi.verifyDpopProof`.
 */
export async function verifyEndpointDpopProof(
	ctx: GenericEndpointContext,
	opts: Pick<OAuthOptions<Scope[]>, "dpop">,
	params?: { required?: boolean; expectedJkt?: string },
): Promise<VerifiedDpopProof | undefined> {
	const proofJwt = getDpopProofJwt(ctx);
	if (!proofJwt) {
		if (params?.required) {
			throwInvalidDpopProof("DPoP proof header is required");
		}
		return undefined;
	}
	// `htm` must match the real request method, which an `auth.api` call
	// without a request does not have.
	if (!ctx.request) {
		throwInvalidDpopProof("DPoP proof requires an HTTP request context");
	}
	return verifyRequestDpopProof(ctx, opts, {
		proofJwt,
		method: ctx.request.method,
		url: getEndpointUrl(ctx, ctx.path),
		expectedJkt: params?.expectedJkt,
	});
}

/**
 * Sets a fresh `DPoP-Nonce` on the response when `dpop.nonce.required` is on.
 * Backs `OAuthProviderApi.issueDpopNonce`.
 */
export async function issueEndpointDpopNonce(
	ctx: GenericEndpointContext,
	opts: Pick<OAuthOptions<Scope[]>, "dpop">,
): Promise<string | undefined> {
	const nonce = getDpopNonceOptions(ctx, opts);
	if (!nonce) return undefined;
	const headers = await setDpopNonceHeader(ctx, nonce);
	return headers[DPOP_NONCE_HEADER];
}

/**
 * RFC 9449 §8: challenges a proof without a current nonce before the request
 * consumes a one-time credential. Checks only the `nonce` claim and leaves the
 * `jti` unreserved, so the proof must still be verified. Backs
 * `OAuthProviderApi.challengeDpopNonce`.
 */
export async function challengeEndpointDpopNonce(
	ctx: GenericEndpointContext,
	opts: Pick<OAuthOptions<Scope[]>, "dpop">,
): Promise<void> {
	const nonce = getDpopNonceOptions(ctx, opts);
	const proofJwt = getDpopProofJwt(ctx);
	if (!nonce || !proofJwt) return;
	try {
		await assertDpopProofNonce(proofJwt, nonce, await getDpopRequestTime());
	} catch (error) {
		if (isDpopProofError(error)) {
			await throwUseDpopNonce(ctx, nonce, error.message);
		}
		throw error;
	}
}
