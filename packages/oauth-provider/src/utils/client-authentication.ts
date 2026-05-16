import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-call";
import type { OAuthOptions, Scope } from "../types";
import { verifyClientAssertion } from "./client-assertion";
import { validateClientCredentials } from "./index";

export function hasClientAssertion(body: Record<string, unknown> | undefined) {
	return Boolean(body?.client_assertion || body?.client_assertion_type);
}

export async function validateOAuthClientAuthentication({
	ctx,
	opts,
	clientId,
	clientSecret,
	scopes,
	expectedAudience,
}: {
	ctx: GenericEndpointContext;
	opts: OAuthOptions<Scope[]>;
	clientId: string;
	clientSecret?: string | undefined;
	scopes?: string[] | undefined;
	expectedAudience?: string | undefined;
}) {
	if (hasClientAssertion(ctx.body)) {
		const clientAssertion = ctx.body.client_assertion;
		const clientAssertionType = ctx.body.client_assertion_type;
		if (
			typeof clientAssertion !== "string" ||
			typeof clientAssertionType !== "string"
		) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client_assertion and client_assertion_type must both be provided",
				error: "invalid_client",
			});
		}
		if (clientSecret) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client_secret cannot be combined with client_assertion",
				error: "invalid_client",
			});
		}

		const { client } = await verifyClientAssertion(
			ctx,
			opts,
			clientAssertion,
			clientAssertionType,
			clientId,
			expectedAudience ?? ctx.request?.url,
		);

		if (scopes && client.scopes) {
			const validScopes = new Set(client.scopes);
			for (const scope of scopes) {
				if (!validScopes.has(scope)) {
					throw new APIError("BAD_REQUEST", {
						error_description: `client does not allow scope ${scope}`,
						error: "invalid_scope",
					});
				}
			}
		}

		return client;
	}

	return validateClientCredentials(ctx, opts, clientId, clientSecret, scopes);
}
