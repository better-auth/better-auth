import { defineRequestState } from "@better-auth/core/context";
import type { VerifiedDpopProof } from "better-auth/oauth2";
import type { OAuthAuthenticatedClient } from "./types";

/**
 * What `authenticateClient` and `verifyDpopProof` proved earlier in this
 * request. Request state is private to the provider, so a caller cannot
 * supply these results itself; it can only make the provider verify them.
 */
const authenticatedClientState =
	defineRequestState<OAuthAuthenticatedClient | null>(() => null);
const verifiedDpopProofState = defineRequestState<VerifiedDpopProof | null>(
	() => null,
);

export const recordAuthenticatedClient = (client: OAuthAuthenticatedClient) =>
	authenticatedClientState.set(client);
export const getRecordedAuthenticatedClient = () =>
	authenticatedClientState.get();
export const recordVerifiedDpopProof = (proof: VerifiedDpopProof) =>
	verifiedDpopProofState.set(proof);
export const getRecordedDpopProof = () => verifiedDpopProofState.get();
