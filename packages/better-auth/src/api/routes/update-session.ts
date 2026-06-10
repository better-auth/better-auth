import type { BetterAuthOptions } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod";
import { deleteSessionCookie, setSessionCookie } from "../../cookies";
import { parseSessionInput, parseSessionOutput } from "../../db/schema";
import type { AdditionalSessionFieldsInput } from "../../types";
import { sensitiveSessionMiddleware } from "./session";

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
			use: [sensitiveSessionMiddleware],
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

			if (!updatedSession) {
				// The backing session row was revoked or deleted (e.g. the user
				// was banned or signed out elsewhere) between authentication and
				// this update. Do not synthesize a replacement session from
				// cached state and reissue a cookie — that would let a revoked
				// session keep renewing itself. Clear the cookies and fail.
				deleteSessionCookie(ctx);
				throw APIError.from(
					"UNAUTHORIZED",
					BASE_ERROR_CODES.FAILED_TO_GET_SESSION,
				);
			}

			await setSessionCookie(ctx, {
				session: updatedSession,
				user: session.user,
			});

			return ctx.json({
				session: parseSessionOutput(ctx.context.options, updatedSession),
			});
		},
	);
