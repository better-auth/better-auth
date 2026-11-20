import type {
	GenericEndpointContext,
	InternalAdapter,
} from "@better-auth/core";
import { getCurrentRequestState } from "@better-auth/core/context";
import type { VerifiedDpopProof } from "better-auth/oauth2";
import type { OAuthAuthenticatedClient } from "./types";

interface RequestChecks {
	clients: WeakMap<
		InternalAdapter,
		Pick<OAuthAuthenticatedClient, "clientId" | "method">
	>;
	proofs: WeakMap<InternalAdapter, Pick<VerifiedDpopProof, "jkt">>;
}

const requestChecksKey = {};

// Nested calls share request state. Each auth instance has its own internal
// adapter, including when dynamic base URLs make a copy of its context.
async function getRequestChecks() {
	const request = await getCurrentRequestState();
	let checks: RequestChecks | undefined = request.get(requestChecksKey);
	if (!checks) {
		checks = { clients: new WeakMap(), proofs: new WeakMap() };
		request.set(requestChecksKey, checks);
	}
	return checks;
}

export const recordAuthenticatedClient = async (
	ctx: GenericEndpointContext,
	{ clientId, method }: OAuthAuthenticatedClient,
) => {
	const { clients } = await getRequestChecks();
	clients.set(ctx.context.internalAdapter, { clientId, method });
};
export const getRecordedAuthenticatedClient = async (
	ctx: GenericEndpointContext,
) => {
	const { clients } = await getRequestChecks();
	return clients.get(ctx.context.internalAdapter) ?? null;
};
export const recordVerifiedDpopProof = async (
	ctx: GenericEndpointContext,
	{ jkt }: VerifiedDpopProof,
) => {
	const { proofs } = await getRequestChecks();
	proofs.set(ctx.context.internalAdapter, { jkt });
};
export const getRecordedDpopProof = async (ctx: GenericEndpointContext) => {
	const { proofs } = await getRequestChecks();
	return proofs.get(ctx.context.internalAdapter) ?? null;
};
