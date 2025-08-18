import type { GenericEndpointContext } from "../../../types";

export function setCORSHeaders(ctx: GenericEndpointContext) {
	ctx.setHeader("Access-Control-Allow-Origin", "*");
	ctx.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	ctx.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	ctx.setHeader("Access-Control-Max-Age", "86400");
}
