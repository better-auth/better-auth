import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { HIDE_METADATA } from "../../utils/hide-metadata";

export const ok = createAuthEndpoint(
	"/ok",
	{
		method: "GET",
		response: z.object({
			ok: z.boolean().meta({ description: "Indicates if the API is working" }),
		}),
		metadata: {
			...HIDE_METADATA,
			openapi: {
				description: "Check if the API is working",
			},
		},
	},
	async (ctx) => {
		return ctx.json({
			ok: true,
		});
	},
);
