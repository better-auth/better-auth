import type { GenericEndpointContext } from "../../../types";

export function makeRedirectHandler(ctx: GenericEndpointContext) {
	return (url: string) => {
		const fromFetch = ctx.request?.headers.get("sec-fetch-mode") === "cors";
		if (fromFetch) {
			return ctx.json({ redirect: true, url });
		}
		throw ctx.redirect(url);
	};
}
