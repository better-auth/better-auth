import type { GenericEndpointContext } from "@better-auth/core";
import { defineRequestState } from "@better-auth/core/context";
import type { VerifiedDpopProof } from "better-auth/oauth2";
import type { OAuthAuthenticatedClient } from "./types";

/**
 * What `authenticateClient` and `verifyDpopProof` proved earlier in this
 * request. Request state is private to the provider, so a caller cannot
 * supply these results itself; it can only make the provider verify them.
 *
 * Request state is shared by nested calls to another auth instance, so each
 * result is kept with the instance that proved it and is read back only by
 * that instance. Another instance can hold a different client under the same
 * `client_id`.
 */
interface Recorded<T> {
	instance: object;
	value: T;
}
const authenticatedClientState =
	defineRequestState<Recorded<OAuthAuthenticatedClient> | null>(() => null);
const verifiedDpopProofState =
	defineRequestState<Recorded<VerifiedDpopProof> | null>(() => null);

// The adapter survives the per-request copy that dynamic base URLs make of the
// context, and no two instances share one.
const instanceOf = (ctx: GenericEndpointContext): object => ctx.context.adapter;

export const recordAuthenticatedClient = (
	ctx: GenericEndpointContext,
	client: OAuthAuthenticatedClient,
) => authenticatedClientState.set({ instance: instanceOf(ctx), value: client });
export const getRecordedAuthenticatedClient = async (
	ctx: GenericEndpointContext,
) => {
	const recorded = await authenticatedClientState.get();
	return recorded?.instance === instanceOf(ctx) ? recorded.value : null;
};
export const recordVerifiedDpopProof = (
	ctx: GenericEndpointContext,
	proof: VerifiedDpopProof,
) => verifiedDpopProofState.set({ instance: instanceOf(ctx), value: proof });
export const getRecordedDpopProof = async (ctx: GenericEndpointContext) => {
	const recorded = await verifiedDpopProofState.get();
	return recorded?.instance === instanceOf(ctx) ? recorded.value : null;
};
