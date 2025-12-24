import type { GenericEndpointContext } from "@better-auth/core";
import { getJwks } from "better-auth/oauth2";
import type { Session } from "better-auth/types";
import { APIError } from "better-call";
import type { JWTPayload } from "jose";
import { compactVerify, createLocalJWKSet, decodeJwt } from "jose";
import { handleRedirect } from "./authorize";
import type { OAuthOptions, Scope } from "./types";
import { decryptStoredClientSecret, getClient, getJwtPlugin } from "./utils";

/**
 * IMPORTANT NOTES:
 * Follows OIDC RP-Initiated Logout
 *
 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 */
export async function rpInitiatedLogoutEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const {
		id_token_hint,
		client_id,
		post_logout_redirect_uri,
		state,
	}: {
		// Spec says `id_token_hint` recommended but we make it required for DOS
		id_token_hint: string;
		client_id?: string;
		post_logout_redirect_uri?: string;
		state?: string;
	} = ctx.query;

	const baseURL = ctx.context.baseURL;
	const jwtPlugin = opts.disableJwtPlugin
		? undefined
		: getJwtPlugin(ctx.context);
	const jwtPluginOptions = jwtPlugin?.options;
	const jwksUrl =
		jwtPluginOptions?.jwks?.remoteUrl ??
		`${baseURL}/${jwtPluginOptions?.jwks?.jwksPath ?? "jwks"}`;

	let clientId = client_id;
	if (!clientId) {
		let decoded: JWTPayload;
		try {
			decoded = decodeJwt(id_token_hint);
		} catch (_e) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "invalid id token",
				error: "invalid_token",
			});
		}
		clientId = decoded?.aud as string | undefined;
		if (!clientId) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				error_description: "id token missing audience",
				error: "invalid_request",
			});
		}
	}

	// Only specified trusted clients can logout via the rpInitiated logout
	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client doesn't exist",
			error: "invalid_client",
		});
	}
	if (client.disabled) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client is disabled",
			error: "invalid_client",
		});
	}
	if (!client.enableEndSession) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "client unable to logout",
			error: "invalid_client",
		});
	}

	// Obtain idTokenPayload
	let idTokenPayload: JWTPayload | undefined;
	if (opts.disableJwtPlugin) {
		// Get the client's secret to verify the token
		const clientSecret = client.clientSecret;
		if (!clientSecret) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "missing required credentials",
				error: "invalid_client",
			});
		}

		// Convert the client secret to a key
		const secret = await decryptStoredClientSecret(
			ctx,
			opts.storeClientSecret,
			clientSecret,
		);
		const key = new TextEncoder().encode(secret);

		// compactVerify only verifies the token, not its claims (perform manually)
		const { payload } = await compactVerify(id_token_hint, key);
		const idToken = new TextDecoder().decode(payload);
		idTokenPayload = JSON.parse(idToken);
	} else {
		const jwks = await getJwks(id_token_hint, {
			jwksFetch: jwksUrl,
		});

		// compactVerify only verifies the token, not its claims (perform manually)
		const { payload } = await compactVerify(
			id_token_hint,
			createLocalJWKSet(jwks),
		);
		const idToken = new TextDecoder().decode(payload);
		idTokenPayload = JSON.parse(idToken);
	}

	if (!idTokenPayload) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "missing payload",
			error: "invalid_request",
		});
	}

	const issuer = jwtPluginOptions?.jwt?.issuer ?? ctx.context.baseURL;
	if (issuer !== idTokenPayload.iss) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "invalid issuer",
			error: "invalid_request",
		});
	}

	const idTokenAudience =
		typeof idTokenPayload.aud === "string"
			? [idTokenPayload.aud]
			: idTokenPayload.aud;
	if (!idTokenAudience) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "id token missing audience",
			error: "invalid_request",
		});
	}
	if (client_id && !idTokenAudience.includes(client_id)) {
		throw new APIError("BAD_REQUEST", {
			error_description: "audience mismatch",
			error: "invalid_request",
		});
	}
	const sessionId = idTokenPayload.sid as string | undefined;

	// Logout using the sid attached to the idToken
	if (!sessionId) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "id token missing session",
			error: "invalid_request",
		});
	}
	try {
		const session = await ctx.context.adapter.findOne<Session>({
			model: "session",
			where: [{ field: "id", value: sessionId }],
		});
		session?.token
			? await ctx.context.internalAdapter.deleteSession(session?.token)
			: session?.id
				? await ctx.context.adapter.delete<Session>({
						model: "session",
						where: [{ field: "id", value: session.id }],
					})
				: await ctx.context.adapter.delete<Session>({
						model: "session",
						where: [{ field: "id", value: sessionId }],
					});
	} catch {
		// continue - session already deleted
	}

	// Redirect to post_logout_redirect_uri if provided and exact match (no need to fail)
	if (post_logout_redirect_uri) {
		const registeredUris = client.postLogoutRedirectUris;
		if (registeredUris?.includes(post_logout_redirect_uri)) {
			const redirectUri = new URL(post_logout_redirect_uri);
			if (state) {
				redirectUri.searchParams.set("state", state);
			}
			return handleRedirect(ctx, redirectUri.toString());
		}
	}
}
