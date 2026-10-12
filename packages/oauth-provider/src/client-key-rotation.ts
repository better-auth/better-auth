import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, NO_STORE_HEADERS } from "better-auth/api";
import { assertValidClientJwks } from "./register";
import type { OAuthClient, OAuthOptions, SchemaClient, Scope } from "./types";
import { verifyClientAssertion } from "./utils/client-assertion";

type ClientJwks = NonNullable<OAuthClient["jwks"]>;

interface RotateClientKeysRequest {
	client_id?: string | undefined;
	client_assertion: string;
	client_assertion_type: string;
	jwks: ClientJwks;
}

/**
 * Replaces a confidential `private_key_jwt` client's inline `jwks` on the
 * client's own authority: the request carries a client assertion signed by one
 * of the client's current keys, so no user session is involved.
 *
 * Keys left out of the new set stop verifying at once. A client rolls a key the
 * way a `jwks_uri` client does: it first sends the old and new keys together,
 * then drops the old key once every instance signs with the new one.
 *
 * The write is guarded on the exact key set the assertion was verified against.
 * A concurrent rotation changes that value, so the stale request loses instead
 * of overwriting a newer key set.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7523#section-3
 */
export async function rotateClientKeysEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): Promise<{ client_id: string; jwks: ClientJwks }> {
	if (!opts.allowClientKeyRotation) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "Client key rotation is disabled",
		});
	}
	const body = ctx.body as RotateClientKeysRequest;
	assertValidClientJwks(body.jwks);

	const { client } = await verifyClientAssertion(
		ctx,
		opts,
		body.client_assertion,
		body.client_assertion_type,
		body.client_id,
		`${ctx.context.baseURL}/oauth2/client/rotate-keys`,
		{ endpointAudienceOnly: true },
	);
	assertRotatable(opts, client);

	const updated = await ctx.context.adapter.incrementOne<SchemaClient<Scope[]>>(
		{
			model: "oauthClient",
			where: [
				{ field: "clientId", value: client.clientId },
				{ field: "jwks", value: client.jwks! },
			],
			increment: {},
			set: {
				jwks: JSON.stringify(body.jwks),
				updatedAt: new Date(),
			},
		},
	);
	if (!updated) {
		throw new APIError(
			"CONFLICT",
			{
				error: "invalid_request",
				error_description:
					"client keys changed while rotating; retry with a fresh client assertion",
			},
			NO_STORE_HEADERS,
		);
	}

	return { client_id: client.clientId, jwks: body.jwks };
}

function assertRotatable(
	opts: OAuthOptions<Scope[]>,
	client: SchemaClient<Scope[]>,
) {
	if (opts.cachedTrustedClients?.has(client.clientId)) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description: "trusted clients must be updated manually",
		});
	}
	if (client.clientDiscoveryId || client.jwksUri || !client.jwks) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description:
				"client keys are not stored inline; rotate them where the client publishes them",
		});
	}
}
