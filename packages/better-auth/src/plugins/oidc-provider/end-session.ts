import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "../../api";
import { getClient } from "./index";
import type { OIDCOptions } from "./types";

/**
 * Handle RP-Initiated Logout according to OpenID Connect RP-Initiated Logout 1.0
 * @see https://openid.net/specs/openid-connect-rpinitiated-1_0.html
 */
export async function handleEndSession(
	ctx: GenericEndpointContext,
	options: OIDCOptions,
) {
	const trustedClients = options.trustedClients || [];
	const query = ctx.query as {
		id_token_hint?: string;
		logout_hint?: string;
		client_id?: string;
		post_logout_redirect_uri?: string;
		state?: string;
		ui_locales?: string;
	};

	const {
		id_token_hint,
		logout_hint,
		client_id,
		post_logout_redirect_uri,
		state,
		ui_locales,
	} = query;

	let validatedClientId: string | null = null;
	let validatedUserId: string | null = null;

	// Validate id_token_hint if provided
	if (id_token_hint) {
		try {
			// Decode the ID token to get the client ID and user ID
			// We need to verify the token was issued by us
			const parts = id_token_hint.split(".");
			if (parts.length !== 3) {
				throw new Error("Invalid ID token format");
			}

			// Decode the payload (we don't verify signature here as the spec says
			// we should accept tokens even if expired for logout)
			const payload = JSON.parse(
				Buffer.from(parts[1]!, "base64").toString("utf-8"),
			);

			validatedClientId = payload.aud;
			validatedUserId = payload.sub;

			// The spec says: "The OP SHOULD accept ID Tokens when the RP identified
			// by the ID Token's aud claim and/or sid claim has a current session or
			// had a recent session at the OP, even when the exp time has passed."
		} catch (error) {
			ctx.context.logger.warn(
				"Failed to decode id_token_hint for logout",
				error,
			);
			// According to spec: "Logout requests without a valid id_token_hint value
			// are a potential means of denial of service"
			// We should proceed with caution but not fail immediately
		}
	}

	// If client_id is provided, use it
	if (client_id) {
		validatedClientId = client_id;
	}

	// Handle post_logout_redirect_uri
	if (post_logout_redirect_uri) {
		if (!validatedClientId) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description:
					"post_logout_redirect_uri requires id_token_hint or client_id",
			});
		}

		// Fetch the client to validate the redirect URI
		const client = await getClient(validatedClientId, trustedClients);
		if (!client) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description: "Invalid client_id",
			});
		}

		// Validate the post_logout_redirect_uri matches a registered one
		const registeredUris = client.postLogoutRedirectUris || [];
		if (!registeredUris.includes(post_logout_redirect_uri)) {
			throw new APIError("BAD_REQUEST", {
				error: "invalid_request",
				error_description:
					"post_logout_redirect_uri does not match any registered URIs",
			});
		}
	}

	// Clear the user's session if they have one
	const session = ctx.context.session;
	if (session) {
		// Delete the session from the database
		await ctx.context.internalAdapter.deleteSession(session.session.token);

		// Clear the session cookie
		await ctx.setSignedCookie(
			ctx.context.authCookies.sessionToken.name,
			"",
			ctx.context.secret,
			{
				...ctx.context.authCookies.sessionToken.options,
				maxAge: 0,
			},
		);
	}

	// If post_logout_redirect_uri is provided, redirect there
	if (post_logout_redirect_uri) {
		const redirectUrl = new URL(post_logout_redirect_uri);
		if (state) {
			redirectUrl.searchParams.set("state", state);
		}
		return ctx.json(
			{ redirect_uri: redirectUrl.toString() },
			{
				status: 200,
			},
		);
	}

	// Otherwise, return a success response
	return ctx.json(
		{ message: "Logout successful" },
		{
			status: 200,
		},
	);
}
