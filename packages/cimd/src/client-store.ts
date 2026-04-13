import type { GenericEndpointContext } from "@better-auth/core";
import type {
	OAuthClient,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "@better-auth/oauth-provider";
import { checkOAuthClient, oauthToSchema } from "@better-auth/oauth-provider";
import { APIError } from "better-call";
import type { CimdOptions } from "./types";
import {
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 5 * 1024; // 5 KB per spec recommendation (§6.6)

/**
 * Accepts `application/json` and the draft's `application/<AS-defined>+json`
 * form. Parameters (charset, etc.) are allowed after the subtype.
 */
const JSON_CONTENT_TYPE_RE = /^application\/(?:[-\w.]+\+)?json\s*(?:;|$)/i;

function tooLargeError(): APIError {
	return new APIError("BAD_REQUEST", {
		error: "invalid_client",
		error_description: `Metadata document exceeds ${MAX_RESPONSE_BYTES / 1024}KB size limit`,
	});
}

/**
 * Stream a Response body into a decoded string, aborting as soon as the
 * running byte count exceeds `max`. Guarantees no more than `max + one
 * chunk` bytes ever sit in memory before the request is canceled.
 */
async function readBodyWithLimit(
	response: Response,
	max: number,
): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) {
		// Runtimes without streaming body support fall back to `text()`; we
		// re-apply the size check on the buffered result for defense in
		// depth.
		const text = await response.text();
		if (new TextEncoder().encode(text).byteLength > max) {
			throw tooLargeError();
		}
		return text;
	}

	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > max) {
			await reader.cancel();
			throw tooLargeError();
		}
		chunks.push(value);
	}

	const merged = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

/**
 * RFC 7591 / CIMD fields accepted from external metadata documents.
 *
 * Security-sensitive fields — `require_pkce`, `disabled`, `skip_consent`,
 * `enable_end_session` — are deliberately excluded. An attacker-controlled
 * document MUST NOT be able to weaken the server's PKCE policy or escalate
 * admin-only flags.
 */
const ALLOWED_METADATA_FIELDS = new Set([
	"client_id",
	"redirect_uris",
	"token_endpoint_auth_method",
	"grant_types",
	"response_types",
	"client_name",
	"client_uri",
	"logo_uri",
	"scope",
	"contacts",
	"tos_uri",
	"policy_uri",
	"software_id",
	"software_version",
	"software_statement",
	"post_logout_redirect_uris",
	"subject_type",
	"type",
	"jwks",
	"jwks_uri",
]);

/**
 * Extract only recognized RFC 7591 / CIMD fields from the metadata document.
 * Prevents arbitrary attacker-controlled fields from leaking into the DB.
 */
function toOAuthClientBody(metadata: Record<string, unknown>): OAuthClient {
	const filtered: Record<string, unknown> = {};
	for (const key of ALLOWED_METADATA_FIELDS) {
		if (key in metadata) {
			filtered[key] = metadata[key];
		}
	}
	return {
		...(filtered as OAuthClient),
		token_endpoint_auth_method:
			(filtered.token_endpoint_auth_method as OAuthClient["token_endpoint_auth_method"]) ??
			"none",
	};
}

/**
 * Create a new client from a Client ID Metadata Document.
 * Called when a URL-format client_id is encountered for the first time.
 *
 * Writes the DB record directly rather than routing through
 * `createOAuthClientEndpoint`, because CIMD clients must use the URL
 * as their `clientId` (not a generated random ID).
 */
export async function createMetadataDocumentClient(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	cimdOptions: CimdOptions,
	oauthOptions: OAuthOptions<Scope[]>,
): Promise<SchemaClient<Scope[]>> {
	const metadata = await fetchAndValidateMetadataDocument(
		ctx,
		clientIdUrl,
		cimdOptions,
	);
	const oauthClient = toOAuthClientBody(metadata);

	await checkOAuthClient(oauthClient, oauthOptions, { isRegister: true });

	const isPrivateKeyJwt =
		oauthClient.token_endpoint_auth_method === "private_key_jwt";
	const iat = Math.floor(Date.now() / 1000);
	const schema = oauthToSchema({
		...oauthClient,
		// Admin-only fields: never trust from external metadata
		disabled: undefined,
		skip_consent: undefined,
		enable_end_session: undefined,
		// Preserve jwks/jwks_uri only for private_key_jwt clients
		jwks: isPrivateKeyJwt ? oauthClient.jwks : undefined,
		jwks_uri: isPrivateKeyJwt ? oauthClient.jwks_uri : undefined,
		client_id: clientIdUrl,
		client_secret: undefined,
		client_secret_expires_at: undefined,
		client_id_issued_at: iat,
		public: !isPrivateKeyJwt,
	});

	const model = oauthOptions.schema?.oauthClient?.modelName ?? "oauthClient";
	let client: SchemaClient<Scope[]>;
	try {
		client = await ctx.context.adapter.create<SchemaClient<Scope[]>>({
			model,
			data: {
				...schema,
				createdAt: new Date(iat * 1000),
				updatedAt: new Date(iat * 1000),
			},
		});
	} catch (err) {
		// A concurrent request may have created this client first. If the
		// record exists by now, return it; otherwise re-throw the original.
		const existing = await ctx.context.adapter.findOne<SchemaClient<Scope[]>>({
			model,
			where: [{ field: "clientId", value: clientIdUrl }],
		});
		if (existing) {
			return existing;
		}
		throw err;
	}

	await cimdOptions.onClientCreated?.({ client, metadata, ctx });

	return client;
}

/**
 * Refresh an existing client by re-fetching its metadata document.
 *
 * Admin-controlled fields (`disabled`, `skip_consent`, `enable_end_session`)
 * are never overwritten from the document — they are read from `existing`
 * and preserved so admin decisions survive a refresh.
 */
export async function refreshMetadataDocumentClient(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	existing: SchemaClient<Scope[]>,
	cimdOptions: CimdOptions,
	oauthOptions: OAuthOptions<Scope[]>,
): Promise<SchemaClient<Scope[]>> {
	const metadata = await fetchAndValidateMetadataDocument(
		ctx,
		clientIdUrl,
		cimdOptions,
	);
	const oauthClient = toOAuthClientBody(metadata);

	await checkOAuthClient(oauthClient, oauthOptions, { isRegister: true });

	const isPrivateKeyJwt =
		oauthClient.token_endpoint_auth_method === "private_key_jwt";
	const schema = oauthToSchema({
		...oauthClient,
		jwks: isPrivateKeyJwt ? oauthClient.jwks : undefined,
		jwks_uri: isPrivateKeyJwt ? oauthClient.jwks_uri : undefined,
		client_id: clientIdUrl,
		client_secret: undefined,
		client_secret_expires_at: undefined,
		public: !isPrivateKeyJwt,
	});

	// Preserve admin-controlled flags that the document MUST NOT influence.
	const preservedAdminFields = {
		disabled: existing.disabled,
		skipConsent: existing.skipConsent,
		enableEndSession: existing.enableEndSession,
	};

	const model = oauthOptions.schema?.oauthClient?.modelName ?? "oauthClient";
	const client = await ctx.context.adapter.update<SchemaClient<Scope[]>>({
		model,
		where: [{ field: "clientId", value: clientIdUrl }],
		update: {
			...schema,
			...preservedAdminFields,
			updatedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
		},
	});

	if (!client) {
		// `update` returning null means no row matched — the client was
		// deleted between the read and the write. That's a race against an
		// admin delete, not a server fault, so surface it as an OAuth
		// invalid_client rather than a 500.
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: "client no longer exists",
		});
	}

	await cimdOptions.onClientRefreshed?.({ client, metadata, ctx });

	return client;
}

/**
 * Fetch a Client ID Metadata Document, validate it against the spec,
 * and return the parsed metadata.
 */
async function fetchAndValidateMetadataDocument(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	cimdOptions: CimdOptions,
): Promise<Record<string, unknown>> {
	// §3: validate the URL structure before fetching
	const urlError = validateClientIdUrl(clientIdUrl);
	if (urlError) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: urlError,
		});
	}

	// Pre-fetch gate: operators can block domains, rate-limit, or reject
	// URLs whose hostnames resolve to non-public addresses (DNS-level SSRF
	// defense beyond the IP-literal check in `validateClientIdUrl`).
	if (cimdOptions.allowFetch) {
		const allowed = await cimdOptions.allowFetch(clientIdUrl, ctx);
		if (!allowed) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_client",
				error_description:
					"client_id URL is not permitted by the server's fetch policy",
			});
		}
	}

	let response: Response;
	try {
		response = await fetch(clientIdUrl, {
			headers: { Accept: "application/json" },
			redirect: "error",
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
	} catch (err) {
		const isTimeout =
			err instanceof DOMException && err.name === "TimeoutError";
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: isTimeout
				? `Metadata document fetch timed out after ${FETCH_TIMEOUT_MS}ms`
				: "Failed to fetch metadata document (network error or redirect blocked)",
		});
	}

	if (!response.ok) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: `Metadata document fetch returned HTTP ${response.status}`,
		});
	}

	// Content-Type must be JSON per RFC 7591. The CIMD draft also permits
	// `application/<AS-defined>+json`, so accept any `*+json` subtype.
	const contentType = response.headers.get("content-type") ?? "";
	if (!JSON_CONTENT_TYPE_RE.test(contentType)) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: `Metadata document must be JSON (got Content-Type "${contentType || "(none)"}")`,
		});
	}

	// §6.6: enforce the response size limit BEFORE buffering the body. A
	// malicious host that serves a multi-gigabyte document would otherwise
	// exhaust memory up to the 5 s timeout. Two layers:
	//   1. Reject immediately if Content-Length declares > 5 KB.
	//   2. Stream-read with a running byte counter and abort on overrun,
	//      so responses without Content-Length are still bounded.
	const contentLengthHeader = response.headers.get("content-length");
	if (contentLengthHeader) {
		const declared = Number.parseInt(contentLengthHeader, 10);
		if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
			await response.body?.cancel();
			throw tooLargeError();
		}
	}

	const bodyText = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);

	let data: Record<string, unknown>;
	try {
		data = JSON.parse(bodyText) as Record<string, unknown>;
	} catch {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: "Metadata document is not valid JSON",
		});
	}

	// §4.1: validate the document contents
	const validation = validateCimdMetadata(
		clientIdUrl,
		data,
		cimdOptions.originBoundFields,
	);

	if (!validation.valid) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: validation.error ?? "Invalid metadata document",
		});
	}

	return data;
}
