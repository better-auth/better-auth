import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "better-auth/api";
import type { ClientJwks } from "./client-jwks";
import { assertValidClientJwks } from "./client-jwks";
import type { OAuthOptions, SchemaClient, Scope } from "./types";
import { assertNotTrustedClient } from "./utils";
import { verifyClientAssertion } from "./utils/client-assertion";

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
	ctx: GenericEndpointContext & {
		body: {
			client_assertion: string;
			client_assertion_type: string;
			jwks: ClientJwks;
		};
	},
	opts: OAuthOptions<Scope[]>,
): Promise<{ client_id: string; jwks: ClientJwks }> {
	if (!opts.allowClientKeyRotation) {
		throw new APIError("FORBIDDEN", {
			error: "access_denied",
			error_description: "Client key rotation is disabled",
		});
	}
	const { body } = ctx;
	assertValidClientJwks(body.jwks);

	const { client } = await verifyClientAssertion(
		ctx,
		opts,
		body.client_assertion,
		body.client_assertion_type,
		undefined,
		`${ctx.context.baseURL}/oauth2/client/rotate-keys`,
		{
			endpointAudienceOnly: true,
			assertClient: (candidate) => assertRotatable(opts, candidate),
		},
	);

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
		throw new APIError("CONFLICT", {
			error: "invalid_request",
			error_description:
				"client keys changed while rotating; retry with a fresh client assertion",
		});
	}

	return { client_id: client.clientId, jwks: body.jwks };
}

function assertRotatable(
	opts: OAuthOptions<Scope[]>,
	client: SchemaClient<Scope[]>,
) {
	assertNotTrustedClient(opts, client.clientId);
	if (client.clientDiscoveryId || client.jwksUri || !client.jwks) {
		throw new APIError("BAD_REQUEST", {
			error: "invalid_client",
			error_description:
				"client keys are not stored inline; rotate them where the client publishes them",
		});
	}
}
