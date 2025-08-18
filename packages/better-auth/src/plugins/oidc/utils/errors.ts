import type { GenericEndpointContext } from "../../../types";

export function formatErrorURL(
	url: string,
	error: string,
	description: string,
): string {
	const u = new URL(url, "http://dummy.base");
	u.searchParams.set("error", error);
	u.searchParams.set("error_description", description);
	return u.toString().replace("http://dummy.base", "");
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
