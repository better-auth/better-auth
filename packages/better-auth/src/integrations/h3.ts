import { type H3Event, getCookie, getResponseHeaders, setCookie } from "h3";
import type { BetterAuthHandler } from "../auth";

export const toH3Handler = async (
	event: H3Event,
	handler: BetterAuthHandler,
) => {
	return await handler(event.node.req, {
		cookieManager: {
			set(name, value, options) {
				setCookie(event, name, value, options);
			},
			get(name) {
				return getCookie(event, name);
			},
		},
		toResponse(res) {
			const response = new Response(
				res.body ? JSON.stringify(res.body) : null,
				{
					headers: {
						...(getResponseHeaders(event) as any),
						...res.headers,
					},
					status: res.status,
					statusText: res.statusText,
				},
			);
			return response;
		},
	});
};
