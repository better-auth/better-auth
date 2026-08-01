import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthClientMetadata,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { registerClientMetadataDocument } from "@better-auth/oauth-provider/internal";
import { APIError } from "better-call";
import type { CimdOptions } from "./types";
import {
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";

const FETCH_TIMEOUT_MS = 5_000;
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
				redirect: "error",
				signal: controller.signal,
			});
		} catch {
			throw invalidClient(
				didTimeOut
					? `Metadata document fetch timed out after ${FETCH_TIMEOUT_MS}ms`
					: FETCH_FAILURE_DESCRIPTION,
			);
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
			throw invalidClient(
				`Metadata document fetch returned HTTP ${response.status}`,
			);
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
				throw invalidClient(
					`Metadata document fetch timed out after ${FETCH_TIMEOUT_MS}ms`,
				);
			}
			if (error instanceof APIError) throw error;
			throw invalidClient(FETCH_FAILURE_DESCRIPTION);
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
