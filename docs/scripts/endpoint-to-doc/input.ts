//@ts-nocheck
import { createAuthEndpoint, sessionMiddleware } from "./index";
import { z } from "zod";

export const updatePasskey = createAuthEndpoint(
	"/passkey/update-passkey",
	{
		method: "POST",
		body: z.object({
			id: z.string({
				description: `The ID of the passkey which will be updated. Eg: \"passkey-id\"`
			}),
			name: z.string({
				description: `The new name which the passkey will be updated to. Eg: \"my-new-passkey-name\"`
			}),
		}),
		use: [sessionMiddleware],
		metadata: {
			openapi: {
				description: "Update a specific passkey's name",
				responses: {
					"200": {
						description: "Passkey updated successfully",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										passkey: {
											$ref: "#/components/schemas/Passkey",
										},
									},
									required: ["passkey"],
								},
							},
						},
					},
				},
			},
		},
	},
	async (ctx) => {
		const passkey = await ctx.context.adapter.findOne<Passkey>({
			model: "passkey",
			where: [
				{
					field: "id",
					value: ctx.body.id,
				},
			],
		});

		if (!passkey) {
			throw new APIError("NOT_FOUND", {
				message: ERROR_CODES.PASSKEY_NOT_FOUND,
			});
		}

		if (passkey.userId !== ctx.context.session.user.id) {
			throw new APIError("UNAUTHORIZED", {
				message: ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY,
			});
		}

		const updatedPasskey = await ctx.context.adapter.update<Passkey>({
			model: "passkey",
			where: [
				{
					field: "id",
					value: ctx.body.id,
				},
			],
			update: {
				name: ctx.body.name,
			},
		});

		if (!updatedPasskey) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: ERROR_CODES.FAILED_TO_UPDATE_PASSKEY,
			});
		}
		return ctx.json(
			{
				passkey: updatedPasskey,
			},
			{
				status: 200,
			},
		);
	},
)