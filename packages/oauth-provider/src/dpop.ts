import type { GenericEndpointContext } from "@better-auth/core";
import type { DpopReplayStore } from "better-auth/oauth2";

/**
 * The slice of the database adapter the replay store needs. Kept structural
 * (rather than the full `DBAdapter`) so any concrete auth instance's adapter
 * satisfies it without dragging in the adapter's options generic.
 */
export interface DpopReplayStoreAdapter {
	create: (data: {
		model: string;
		data: Record<string, unknown>;
	}) => Promise<unknown>;
}

export const DPOP_PROOF_MODEL = "oauthDpopProof";

export function getDpopProofJwt(
	ctx: Pick<GenericEndpointContext, "headers">,
): string | undefined {
	return ctx.headers?.get("dpop") ?? undefined;
}

export function getEndpointUrl(
	ctx: Pick<GenericEndpointContext, "context"> & { request?: Request },
	path: string,
): string {
	return ctx.request?.url ?? `${ctx.context.baseURL}${path}`;
}

export function getEndpointMethod(
	ctx: { request?: Request },
	fallback: string,
): string {
	return ctx.request?.method ?? fallback;
}

/**
 * Database-backed DPoP proof replay store. A reservation is a single insert
 * against the unique `replayId`, so a replayed `jti` collides on the primary
 * key and the insert fails atomically across every adapter and every server
 * process. This is shared by the token, userinfo, and resource-server paths so
 * multi-instance deployments get real anti-replay (unlike the in-memory
 * default in `verifyAccessTokenRequest`).
 *
 * TODO(dpop-replay-cleanup): expired rows accumulate until a deployment-level
 * sweep removes them, matching the `oauthClientAssertion` table. A scheduled
 * prune keyed on `expiresAt` is the follow-up.
 */
export function createOauthDpopReplayStore(
	adapter: DpopReplayStoreAdapter,
	modelName: string = DPOP_PROOF_MODEL,
): DpopReplayStore {
	return {
		async reserve({ key, expiresAt, now }) {
			try {
				await adapter.create({
					model: modelName,
					data: {
						replayId: key,
						expiresAt,
						createdAt: now,
					},
				});
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (/unique|duplicate/i.test(message)) return false;
				throw error;
			}
		},
	};
}
