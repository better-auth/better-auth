import type { GenericEndpointContext } from "@better-auth/core";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "better-auth/api";
import {
	checkOAuthClient,
	createOAuthClientEndpoint,
	oauthToSchema,
} from "../register";
import type { OAuthClient, OAuthOptions, SchemaClient, Scope } from "../types";
import { OAuthClientMetadataSchema } from "../types/oauth";
import { dnsToIp, isPublicIp } from "../utils";

export async function createCimdClient(
	ctx: GenericEndpointContext,
	url: URL,
	opts: OAuthOptions<Scope[]>,
) {
	const cimdMetadata = await getCimdClient(url, opts);
	ctx.body = cimdMetadata;
	const client = await createOAuthClientEndpoint(ctx, opts, {
		isRegister: true, // Same as new client registration
	});
	return oauthToSchema(client);
}

export async function refreshCimdClient(
	ctx: GenericEndpointContext,
	url: URL,
	opts: OAuthOptions<Scope[]>,
) {
	const cimdMetadata = await getCimdClient(url, opts);
	await checkOAuthClient(cimdMetadata, opts, {
		isRegister: true, // Same as new client registration
	});
	const schema = oauthToSchema(cimdMetadata);
	const client = await ctx.context.adapter.update<SchemaClient<Scope[]>>({
		model: "oauthClient",
		where: [
			{
				field: "clientId",
				value: url.toString(),
			},
		],
		update: {
			...schema,
			updatedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
		},
	});
	return client!;
}

/**
 * Obtains a Client Metadata Document (CIMD)
 */
async function getCimdClient(url: URL, opts: OAuthOptions<Scope[]>) {
	const ip = await dnsToIp(url.hostname);
	if (!isPublicIp(ip)) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: "invalid host url",
		});
	}

	const cimdMetadataData = await betterFetch<OAuthClient>(url.toString(), {
		headers: {
			accept: "application/json",
		},
		redirect: "error", // Don't follow redirects due to prevent SSRF
	});
	if (cimdMetadataData.error) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: cimdMetadataData.error,
		});
	}

	const cimdMetadata = OAuthClientMetadataSchema.parse(cimdMetadataData.data);

	await checkCimdClient(url, cimdMetadata, opts);
	return cimdMetadata as OAuthClient;
}

/**
 * Check response from getCimdClient with restrictions on cimd client metadata.
 * @see https://datatracker.ietf.org/doc/draft-ietf-oauth-client-id-metadata-document/
 * @internal (used in register.test.ts)
 */
export async function checkCimdClient(
	url: URL,
	cimdMetadata: OAuthClient,
	opts: OAuthOptions<Scope[]>,
) {
	if (cimdMetadata.client_secret || cimdMetadata.client_secret_expires_at) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: "cimd unable to utilize shared client secrets",
		});
	}
	if (
		cimdMetadata.token_endpoint_auth_method &&
		["client_secret_post", "client_secret_basic", "client_secret_jwt"].includes(
			cimdMetadata.token_endpoint_auth_method,
		)
	) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description:
				"cimd token_endpoint_auth_method unable to utilize shared client secrets",
		});
	}

	// Restrict Uri origins
	if (opts.cimd?.enable) {
		for (const key of opts.cimd.restrictOrigins ?? [
			"redirect_uris",
			"post_logout_redirect_uris",
			"client_uri",
		]) {
			const cimdMetadataValue =
				typeof cimdMetadata[key] === "string"
					? [cimdMetadata[key]]
					: cimdMetadata[key];
			for (const val of cimdMetadataValue ?? []) {
				const uri = URL.canParse(val) ? URL.parse(val) : undefined;
				if (!uri || uri.protocol !== "https:") {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client",
						error_description: `all values for ${key} must be https`,
					});
				}
				if (uri.origin !== url.origin) {
					throw new APIError("BAD_REQUEST", {
						error: "invalid_client",
						error_description: `cimd ${key} value ${uri.toString()} must have origin ${url.origin}`,
					});
				}
			}
		}
	}
}
