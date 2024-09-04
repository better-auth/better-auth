import { HIDE_ON_CLIENT_METADATA } from "../../client/client-utils";
import { createAuthEndpoint } from "../call";

export const ok = createAuthEndpoint(
	"/ok",
	{
		method: "GET",
		metadata: HIDE_ON_CLIENT_METADATA,
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
		metadata: HIDE_ON_CLIENT_METADATA,
	},
	async () => {
		return new Response("Welcome to Better Auth");
	},
);
