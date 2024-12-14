import { HIDE_METADATA } from "../../utils/hide-metadata";
import { createAuthEndpoint } from "../call";

export const ok = createAuthEndpoint(
	"/ok",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			openapi: {
				description: "Check if the API is working",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										ok: {
											type: "boolean",
										},
									},
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		return ctx.json({
			ok: true,
		});
	},
);
