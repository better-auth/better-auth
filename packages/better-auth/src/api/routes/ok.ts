import { createAuthEndpoint } from "../call";

export const ok = createAuthEndpoint(
	"/ok",
	{
		method: "GET",
	},
	async (ctx) => {
		return ctx.json({
			ok: true,
		});
	},
);
