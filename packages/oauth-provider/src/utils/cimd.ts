import type { GenericEndpointContext } from "@better-auth/core";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-auth/api";
import { checkOAuthClient, oauthToSchema } from "../register";
import type { OAuthClient, OAuthOptions, SchemaClient, Scope } from "../types";
import {
	validateCimdMetadata,
	validateClientIdUrl,
} from "./validate-metadata-document";

export { isUrlClientId } from "./validate-metadata-document";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 5 * 1024; // 5 KB per spec recommendation (§6.6)

/** RFC 7591 / CIMD fields accepted from external metadata documents. */
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
	opts: OAuthOptions<Scope[]>,
): Promise<SchemaClient<Scope[]>> {
	const metadata = await fetchAndValidateMetadataDocument(clientIdUrl, opts);
	const oauthClient = toOAuthClientBody(metadata);

	await checkOAuthClient(oauthClient, opts, { isRegister: true });

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

	const model = opts.schema?.oauthClient?.modelName ?? "oauthClient";
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
		// A concurrent request may have created this client first.
		// If the record exists, return it; otherwise re-throw the original error.
		const existing = await ctx.context.adapter.findOne<SchemaClient<Scope[]>>({
			model,
			where: [{ field: "clientId", value: clientIdUrl }],
		});
		if (existing) {
			return existing;
		}
		throw err;
	}

	await opts.clientIdMetadataDocument?.onClientCreated?.({
		client,
		metadata,
		ctx,
	});

	return client;
}

/**
 * Refresh an existing client by re-fetching its metadata document.
 */
export async function refreshMetadataDocumentClient(
	ctx: GenericEndpointContext,
	clientIdUrl: string,
	opts: OAuthOptions<Scope[]>,
): Promise<SchemaClient<Scope[]>> {
	const metadata = await fetchAndValidateMetadataDocument(clientIdUrl, opts);
	const oauthClient = toOAuthClientBody(metadata);

	await checkOAuthClient(oauthClient, opts, { isRegister: true });

	const isPrivateKeyJwt =
		oauthClient.token_endpoint_auth_method === "private_key_jwt";
	const schema = oauthToSchema({
		...oauthClient,
		disabled: undefined,
		skip_consent: undefined,
		enable_end_session: undefined,
		jwks: isPrivateKeyJwt ? oauthClient.jwks : undefined,
		jwks_uri: isPrivateKeyJwt ? oauthClient.jwks_uri : undefined,
		client_id: clientIdUrl,
		client_secret: undefined,
		client_secret_expires_at: undefined,
		public: !isPrivateKeyJwt,
	});

	const model = opts.schema?.oauthClient?.modelName ?? "oauthClient";
	const client = await ctx.context.adapter.update<SchemaClient<Scope[]>>({
		model,
		where: [{ field: "clientId", value: clientIdUrl }],
		update: {
			...schema,
			updatedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
		},
	});

	if (!client) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description:
				"Failed to update client from metadata document (client may have been deleted)",
		});
	}

	await opts.clientIdMetadataDocument?.onClientRefreshed?.({
		client,
		metadata,
		ctx,
	});

	return client;
}

/**
 * Fetch a Client ID Metadata Document, validate it against the spec,
 * and return the parsed metadata.
 */
async function fetchAndValidateMetadataDocument(
	clientIdUrl: string,
	opts: OAuthOptions<Scope[]>,
): Promise<Record<string, unknown>> {
	// §3: validate the URL structure before fetching
	const urlError = validateClientIdUrl(clientIdUrl);
	if (urlError) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: urlError,
		});
	}

	let result: { data: Record<string, unknown> | null; error: unknown };
	try {
		result = await betterFetch<Record<string, unknown>>(clientIdUrl, {
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

	if (result.error || !result.data) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: "Metadata document returned a non-success response",
		});
	}

	// §6.6: enforce response size limit
	const serialized = JSON.stringify(result.data);
	if (serialized.length > MAX_RESPONSE_BYTES) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: `Metadata document exceeds ${MAX_RESPONSE_BYTES / 1024}KB size limit`,
		});
	}

	// §4.1: validate the document contents
	const originBoundFields = opts.clientIdMetadataDocument?.originBoundFields;
	const validation = validateCimdMetadata(
		clientIdUrl,
		result.data,
		originBoundFields,
	);

	if (!validation.valid) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: validation.error ?? "Invalid metadata document",
		});
	}

	return result.data;
}
