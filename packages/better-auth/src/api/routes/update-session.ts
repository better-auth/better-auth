import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { parseSessionInput, parseSessionOutput } from "../../db/schema";
import type { AdditionalSessionFieldsInput } from "../../types";
import { sessionMiddleware } from "./session";

const updateSessionBodySchema = z.record(
	z.string().meta({
		description: "Field name must be a string",
	}),
	z.any(),
);

export const updateSession = <O extends BetterAuthOptions>() =>
	createAuthEndpoint(
		"/update-session",
		{
			method: "POST",
			operationId: "updateSession",
			body: updateSessionBodySchema,
			use: [sessionMiddleware],
			metadata: {
				$Infer: {
					body: {} as Partial<AdditionalSessionFieldsInput<O>>,
				},
				openapi: {
					operationId: "updateSession",
					description: "Update the current session",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											session: {
												type: "object",
												$ref: "#/components/schemas/Session",
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
			const body = ctx.body as Record<string, any>;

			if (typeof body !== "object" || Array.isArray(body)) {
				throw APIError.from(
					"BAD_REQUEST",
					BASE_ERROR_CODES.BODY_MUST_BE_AN_OBJECT,
				);
			}

			const session = ctx.context.session;
			const additionalFields = parseSessionInput(
				ctx.context.options,
				body,
				"update",
			);

			if (Object.keys(additionalFields).length === 0) {
				throw APIError.fromStatus("BAD_REQUEST", {
					message: "No fields to update",
				});
			}

			const updatedSession = await ctx.context.internalAdapter.updateSession(
				session.session.token,
				{
					...additionalFields,
					updatedAt: new Date(),
				},
			);

			const newSession = updatedSession ?? {
				...session.session,
				...additionalFields,
				updatedAt: new Date(),
			};

			await setSessionCookie(ctx, {
				session: newSession,
				user: session.user,
			});

			return ctx.json({
				session: parseSessionOutput(ctx.context.options, newSession),
			});
		},
	);
