import type { GenericEndpointContext } from "@better-auth/core";
import type { DpopReplayStore } from "better-auth/oauth2";
import type { OAuthOptions, Scope } from "./types";

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

export function createOauthDpopReplayStore(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
): DpopReplayStore {
	const model = opts.schema?.oauthDpopProof?.modelName ?? "oauthDpopProof";
	return {
		async reserve({ key, expiresAt, now }) {
			await ctx.context.adapter.deleteMany({
				model,
				where: [
					{ field: "expiresAt", operator: "lt", value: now.toISOString() },
				],
			});
			try {
				await ctx.context.adapter.create({
					model,
					data: {
						replayId: key,
						expiresAt,
						createdAt: now,
					},
				});
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (/unique|duplicate|UNIQUE/i.test(message)) return false;
				throw error;
			}
		},
	};
}
