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

export interface MetadataDocumentResponseCacheHeaders {
	cacheControl?: string;
	expires?: string;
	date?: string;
	age?: string;
	etag?: string;
	lastModified?: string;
}

export type MetadataDocumentFetchResult =
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
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		byteLength += value.byteLength;
		if (byteLength > maximumBytes) {
			await reader.cancel();
			throw tooLargeError();
		}
		chunks.push(value);
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
export async function fetchMetadataDocument(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	cimdOptions: CimdOptions,
	validators?: { etag?: string; lastModified?: string },
): Promise<MetadataDocumentFetchResult> {
	const urlError = validateClientIdUrl(clientIdUrl, {
		allowLoopback: cimdOptions.allowLoopback,
	});
	if (urlError) throw invalidClient(urlError);

	if (cimdOptions.allowFetch) {
		const allowed = await cimdOptions.allowFetch(clientIdUrl, ctx);
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
	try {
		const fetchImplementation =
			cimdOptions.fetchMetadataDocument ?? globalThis.fetch;
		response = await fetchImplementation(clientIdUrl, {
			headers: requestHeaders,
			redirect: "error",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
	} catch (error) {
		const isTimeout =
			error instanceof DOMException && error.name === "TimeoutError";
		throw invalidClient(
			isTimeout
				? `Metadata document fetch timed out after ${FETCH_TIMEOUT_MS}ms`
				: "Failed to fetch metadata document (network error or redirect blocked)",
		);
	}

	const cacheHeaders = readResponseCacheHeaders(response.headers);
	if (response.status === 304) {
		return { status: "not-modified", cacheHeaders };
	}
	if (!response.ok) {
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

	const contentLength = response.headers.get("content-length");
	if (contentLength) {
		const declaredBytes = Number.parseInt(contentLength, 10);
		if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RESPONSE_BYTES) {
			await response.body?.cancel();
			throw tooLargeError();
		}
	}

	const bodyText = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
	let rawMetadata: unknown;
	try {
		rawMetadata = JSON.parse(bodyText);
	} catch {
		throw invalidClient("Metadata document is not valid JSON");
	}

	const validation = validateCimdMetadata(
		clientIdUrl,
		rawMetadata,
		cimdOptions.originBoundFields,
	);
	if (!validation.valid || !validation.metadata) {
		throw invalidClient(
			validation.error ?? "Invalid Client ID Metadata Document",
		);
	}

	return {
		status: "modified",
		metadata: validation.metadata,
		cacheHeaders,
	};
}

export async function persistMetadataDocumentClient(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	metadata: OAuthClientMetadata,
	cimdOptions: CimdOptions,
	oauthOptions: OAuthOptions<Scope[]>,
	existingClient?: SchemaClient<Scope[]>,
): Promise<SchemaClient<Scope[]>> {
	const result = await registerClientMetadataDocument(ctx, oauthOptions, {
		clientId: clientIdUrl,
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
				metadata,
				ctx,
			});
		} catch (error) {
			ctx.context.logger.error(
				"cimd onClientCreated notification failed",
				error,
			);
		}
	} else {
		try {
			await cimdOptions.onClientRefreshed?.({
				client: result.client,
				metadata,
				ctx,
			});
		} catch (error) {
			ctx.context.logger.error(
				"cimd onClientRefreshed notification failed",
				error,
			);
		}
	}
	return result.client;
}
