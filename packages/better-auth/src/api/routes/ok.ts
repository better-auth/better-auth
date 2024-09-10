import { HIDE_METADATA } from "../../utils/hide-metadata";
import { createAuthEndpoint } from "../call";

export const ok = createAuthEndpoint(
	"/ok",
	{
		method: "GET",
		metadata: HIDE_METADATA,
	},
	async (ctx) => {
		return ctx.json({
			ok: true,
		});
	},
);
