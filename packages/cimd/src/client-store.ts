import type { GenericEndpointContext } from "@better-auth/core";
import { isAPIError } from "@better-auth/core/utils/is-api-error";
import type {
	OAuthClientMetadata,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import {
	isAbortedBySignal,
	isLocalCapacityRefusal,
	isTransientHttpStatus,
	isTransientNetworkError,
	registerClientMetadataDocument,
} from "@better-auth/oauth-provider/internal";
import { APIError } from "better-call";
import type { CimdOptions } from "./types";
import {
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";

export const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 5 * 1024;
const JSON_CONTENT_TYPE_RE = /^application\/(?:[-\w.]+\+)?json\s*(?:;|$)/i;
const FETCH_FAILURE_DESCRIPTION =
	"Failed to fetch metadata document (network error or redirect blocked)";
export const CIMD_CLIENT_DISCOVERY_ID = "cimd";

export interface MetadataDocumentResponseCacheHeaders {
	cacheControl?: string;
	vary?: string;
	expires?: string;
	date?: string;
	age?: string;
	etag?: string;
	lastModified?: string;
}

export type ClientMetadataDocumentResult =
	| {
			status: "modified";
			metadata: OAuthClientMetadata;
			cacheHeaders: MetadataDocumentResponseCacheHeaders;
	  }
	| {
			status: "not-modified";
			cacheHeaders: MetadataDocumentResponseCacheHeaders;
	  };

function invalidClient(description: string): APIError {
	return new APIError("BAD_REQUEST", {
		error: "invalid_client",
		error_description: description,
	});
}

// Fetch failures that a later fetch can get past: the fetch timeout, a
// connection failure, or HTTP 500, 502, 503, or 504. They answer with the same
// error as any other failure, so the classification is kept beside the error
// instead.
const transientMetadataFetchFailures = new WeakSet<object>();
const metadataFetchCapacityRefusals = new WeakSet<object>();

function transientInvalidClient(description: string): APIError {
	const error = invalidClient(description);
	transientMetadataFetchFailures.add(error);
	return error;
}

/**
 * Whether a metadata document fetch failed transiently: it timed out, its
 * connection failed, or the server answered with HTTP 500, 502, 503, or 504.
 */
export function isTransientMetadataFetchFailure(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		transientMetadataFetchFailures.has(error)
	);
}

/**
 * Whether the transport refused a metadata document fetch at a local capacity
 * limit, which says nothing about the document or its host.
 */
export function isMetadataFetchCapacityRefusal(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		metadataFetchCapacityRefusals.has(error)
	);
}

function metadataFetchCapacityRefusal(): APIError {
	const error = new APIError("TOO_MANY_REQUESTS", {
		error: "temporarily_unavailable",
		error_description: "metadata DNS lookup capacity exceeded",
	});
	metadataFetchCapacityRefusals.add(error);
	return error;
}

function tooLargeError(): APIError {
	return invalidClient(
		`Metadata document exceeds ${MAX_RESPONSE_BYTES / 1024}KB size limit`,
	);
}

async function readBodyWithLimit(
	response: Response,
	maximumBytes: number,
	signal: AbortSignal,
): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) {
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > maximumBytes) {
			throw tooLargeError();
		}
		return text;
	}

	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	let rejectOnAbort: ((reason: Error) => void) | undefined;
	const aborted = new Promise<never>((_resolve, reject) => {
		rejectOnAbort = reject;
	});
	const abortRead = () => {
		rejectOnAbort?.(new Error("Metadata document body read aborted"));
		void reader.cancel().catch(() => {});
	};
	if (signal.aborted) {
		abortRead();
	} else {
		signal.addEventListener("abort", abortRead, { once: true });
	}

	try {
		while (true) {
			const { done, value } = await Promise.race([reader.read(), aborted]);
			if (done) break;
			byteLength += value.byteLength;
			if (byteLength > maximumBytes) {
				await reader.cancel();
				throw tooLargeError();
			}
			chunks.push(value);
		}
	} finally {
		signal.removeEventListener("abort", abortRead);
		reader.releaseLock();
	}

	const body = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(body);
}

function readResponseCacheHeaders(
	headers: Headers,
): MetadataDocumentResponseCacheHeaders {
	return {
		cacheControl: headers.get("cache-control") ?? undefined,
		vary: headers.get("vary") ?? undefined,
		expires: headers.get("expires") ?? undefined,
		date: headers.get("date") ?? undefined,
		age: headers.get("age") ?? undefined,
		etag: headers.get("etag") ?? undefined,
		lastModified: headers.get("last-modified") ?? undefined,
	};
}

/**
 * Fetch and validate one Client ID Metadata Document.
 *
 * Conditional validators are accepted only from the resolver's previously
 * validated cache entry. A 304 response therefore carries no metadata and must
 * be joined with that entry by the caller.
 */
export async function fetchClientMetadataDocument(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	cimdOptions: CimdOptions,
	validators?: { etag?: string; lastModified?: string },
): Promise<ClientMetadataDocumentResult> {
	const urlError = validateClientIdUrl(clientIdUrl);
	if (urlError) throw invalidClient(urlError);

	if (cimdOptions.isMetadataDocumentUrlAllowed) {
		const allowed = await cimdOptions.isMetadataDocumentUrlAllowed(
			clientIdUrl,
			ctx,
		);
		if (!allowed) {
			throw invalidClient(
				"client_id URL is not permitted by the server's fetch policy",
			);
		}
	}

	const requestHeaders = new Headers({ Accept: "application/json" });
	if (validators?.etag) requestHeaders.set("If-None-Match", validators.etag);
	if (validators?.lastModified) {
		requestHeaders.set("If-Modified-Since", validators.lastModified);
	}

	let response: Response;
	const controller = new AbortController();
	let didTimeOut = false;
	const timeout = setTimeout(() => {
		didTimeOut = true;
		controller.abort();
	}, FETCH_TIMEOUT_MS);
	try {
		try {
			response = await cimdOptions.fetchClientMetadataResource(clientIdUrl, {
				headers: requestHeaders,
				// Not "error": Workers rejects it. The status check refuses 3xx and opaque redirects.
				redirect: "manual",
				signal: controller.signal,
			});
		} catch (error) {
			if (isLocalCapacityRefusal(error)) throw metadataFetchCapacityRefusal();
			const description = didTimeOut
				? `Metadata document fetch timed out after ${FETCH_TIMEOUT_MS}ms`
				: FETCH_FAILURE_DESCRIPTION;
			// A refusal that arrives after the timeout fired is still a refusal.
			const transient =
				(didTimeOut && isAbortedBySignal(error, controller.signal)) ||
				isTransientNetworkError(error);
			if (transient) throw transientInvalidClient(description);
			throw invalidClient(description);
		}
		if (response.redirected) {
			throw invalidClient("Metadata document fetch must not follow redirects");
		}

		const cacheHeaders = readResponseCacheHeaders(response.headers);
		if (response.status === 304) {
			if (!validators?.etag && !validators?.lastModified) {
				throw invalidClient(
					"Metadata document returned 304 without a conditional validator",
				);
			}
			return { status: "not-modified", cacheHeaders };
		}
		if (response.status !== 200) {
			const description = `Metadata document fetch returned HTTP ${response.status}`;
			throw isTransientHttpStatus(response.status)
				? transientInvalidClient(description)
				: invalidClient(description);
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (!JSON_CONTENT_TYPE_RE.test(contentType)) {
			throw invalidClient(
				`Metadata document must be JSON (got Content-Type "${contentType || "(none)"}")`,
			);
		}

		let bodyText: string;
		try {
			const contentLength = response.headers.get("content-length");
			if (contentLength) {
				const declaredBytes = Number.parseInt(contentLength, 10);
				if (
					Number.isFinite(declaredBytes) &&
					declaredBytes > MAX_RESPONSE_BYTES
				) {
					await response.body?.cancel();
					throw tooLargeError();
				}
			}

			bodyText = await readBodyWithLimit(
				response,
				MAX_RESPONSE_BYTES,
				controller.signal,
			);
		} catch (error) {
			if (didTimeOut) {
				const description = `Metadata document fetch timed out after ${FETCH_TIMEOUT_MS}ms`;
				throw isAPIError(error)
					? invalidClient(description)
					: transientInvalidClient(description);
			}
			if (isAPIError(error)) throw error;
			throw isTransientNetworkError(error)
				? transientInvalidClient(FETCH_FAILURE_DESCRIPTION)
				: invalidClient(FETCH_FAILURE_DESCRIPTION);
		}
		let rawMetadata: unknown;
		try {
			rawMetadata = JSON.parse(bodyText);
		} catch {
			throw invalidClient("Metadata document is not valid JSON");
		}

		const validation = validateCimdMetadata(clientIdUrl, rawMetadata, {
			originBoundFields: cimdOptions.originBoundFields,
			metadataProfile: cimdOptions.metadataProfile,
		});
		if (!validation.valid) throw invalidClient(validation.error);
		for (const warning of validation.warnings ?? []) {
			ctx.context.logger.warn(`cimd metadata document warning: ${warning}`);
		}

		return {
			status: "modified",
			metadata: validation.metadata,
			cacheHeaders,
		};
	} finally {
		clearTimeout(timeout);
		// A refused response may still be streaming; aborting lets the transport
		// release its connection instead of holding it until the server closes it.
		controller.abort();
	}
}

export async function persistMetadataDocumentClient(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	metadata: OAuthClientMetadata,
	cimdOptions: CimdOptions,
	oauthOptions: OAuthOptions<Scope[]>,
	existingClient?: SchemaClient<Scope[]>,
): Promise<SchemaClient<Scope[]>> {
	const previousClient = existingClient ? { ...existingClient } : undefined;
	const result = await registerClientMetadataDocument(ctx, oauthOptions, {
		clientId: clientIdUrl,
		clientDiscoveryId: CIMD_CLIENT_DISCOVERY_ID,
		metadata: {
			...metadata,
			client_id: metadata.client_id,
			redirect_uris: metadata.redirect_uris ?? [],
		},
		existingClient,
	});

	if (result.created) {
		try {
			await cimdOptions.onClientCreated?.({
				client: result.client,
				clientMetadataDocument: metadata,
				context: ctx,
			});
		} catch (error) {
			ctx.context.logger.error(
				"cimd onClientCreated notification failed",
				error,
			);
		}
	} else {
		try {
			if (previousClient) {
				await cimdOptions.onClientRefreshed?.({
					client: result.client,
					previousClient,
					clientMetadataDocument: metadata,
					context: ctx,
				});
			}
		} catch (error) {
			ctx.context.logger.error(
				"cimd onClientRefreshed notification failed",
				error,
			);
		}
	}
	return result.client;
}
