import type { GenericEndpointContext } from "@better-auth/core";

export function getDpopProofJwt(
	ctx: Pick<GenericEndpointContext, "headers">,
): string | undefined {
	return ctx.headers?.get("dpop") ?? undefined;
}
