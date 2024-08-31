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

export const welcome = createAuthEndpoint(
	"/welcome/ok",
	{
		method: "GET",
	},
	async () => {
		return new Response("Welcome to Better Auth");
	},
);
