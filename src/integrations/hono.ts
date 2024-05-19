import type { HonoRequest } from "hono";
import type { BetterAuthHandler } from "..";

export const toHonoHandler = async (
	handler: BetterAuthHandler,
	request: HonoRequest,
) => {
	if (request.method === "POST") {
		const req = new Request(request.url, {
			method: request.method,
			headers: request.header(),
			body: JSON.stringify(await request.json()),
		});
		return handler(req);
	}
	if (request.method === "GET") {
		const req = new Request(request.url, {
			method: request.method,
			headers: request.header(),
		});
		return handler(req);
	}
	return new Response(null, {
		status: 405,
	});
};
