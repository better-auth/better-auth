import type { GenericEndpointContext } from "../../../types";

export function formatErrorURL(
	url: string,
	error: string,
	description: string,
) {
	return `${url.includes("?") ? "&" : "?"}error=${error}&error_description=${description}`;
}

export function getErrorURL(
	ctx: GenericEndpointContext,
	error: string,
	description: string,
) {
	const baseURL =
		ctx.context.options.onAPIError?.errorURL || `${ctx.context.baseURL}/error`;
	return formatErrorURL(baseURL, error, description);
}
