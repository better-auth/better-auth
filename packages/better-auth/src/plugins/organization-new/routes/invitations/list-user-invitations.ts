import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod/v4";
import { APIError, getSessionFromCtx } from "../../../../api";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgMiddleware } from "../../middleware/org-middleware";
import type { OrganizationOptions } from "../../types";

/**
 * List all invitations a user has received
 */
export const listUserInvitations = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/list-user-invitations",
		{
			method: "GET",
			use: [orgMiddleware],
			query: z
				.object({
					email: z
						.string()
						.meta({
							description:
								"The email of the user to list invitations for. This only works for server side API calls.",
						})
						.optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description: "List all invitations a user has received",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
											type: "object",
											properties: {
												id: {
													type: "string",
												},
												email: {
													type: "string",
												},
												role: {
													type: "string",
												},
												organizationId: {
													type: "string",
												},
												organizationName: {
													type: "string",
												},
												inviterId: {
													type: "string",
													description:
														"The ID of the user who created the invitation",
												},
												teamId: {
													type: "string",
													description:
														"The ID of the team associated with the invitation",
													nullable: true,
												},
												status: {
													type: "string",
												},
												expiresAt: {
													type: "string",
												},
												createdAt: {
													type: "string",
												},
											},
											required: [
												"id",
												"email",
												"role",
												"organizationId",
												"organizationName",
												"inviterId",
												"status",
												"expiresAt",
												"createdAt",
											],
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
			const session = await getSessionFromCtx(ctx);

			if (ctx.request && ctx.query?.email) {
				const code = "USER_EMAIL_CANNOT_BE_PASSED_FOR_CLIENT_SIDE_API_CALLS";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const userEmail = session?.user.email || ctx.query?.email;
			if (!userEmail) {
				const code = "MISSING_SESSION_HEADERS_OR_EMAIL_QUERY_PARAMETER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);

			const invitations = await adapter.listUserInvitations(userEmail);
			const pendingInvitations = invitations.filter(
				(inv) => inv.status === "pending",
			);
			return ctx.json(pendingInvitations);
		},
	);
