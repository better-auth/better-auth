import type { GenericEndpointContext } from "@better-auth/core";
import { appendURLPath } from "@better-auth/core/utils/url";

export function getDpopProofJwt(
	ctx: Pick<GenericEndpointContext, "headers">,
): string | undefined {
	return ctx.headers?.get("dpop") ?? undefined;
}

export function getEndpointUrl(
	ctx: Pick<GenericEndpointContext, "context"> & { request?: Request },
	path: string,
): string {
	return ctx.request?.url ?? appendURLPath(ctx.context.baseURL, path);
}
