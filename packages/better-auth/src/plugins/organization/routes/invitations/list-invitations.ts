import * as z from "zod";
import { createAuthEndpoint } from "@better-auth/core/middleware";
import { getSessionFromCtx } from "../../../../api/routes";
import { getOrgAdapter } from "../../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../call";
import { APIError } from "better-call";
import { type OrganizationOptions } from "../../types";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";

export const listInvitations = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-invitations",
		{
			method: "GET",
			use: [orgMiddleware, orgSessionMiddleware],
			query: z
				.object({
					organizationId: z
						.string()
						.meta({
							description: "The ID of the organization to list invitations for",
						})
						.optional(),
					offset: z.coerce
						.number()
						.meta({
							description: "The offset to start from",
						})
						.optional(),
					limit: z.coerce
						.number()
						.meta({
							description: "The limit to return",
						})
						.optional(),
					sortBy: z
						.string()
						.meta({
							description: "The field to sort by",
						})
						.optional(),
					sortDirection: z
						.enum(["asc", "desc"])
						.meta({
							description: "The direction to sort by",
						})
						.optional(),
					filterField: z
						.string()
						.meta({
							description: "The field to filter by",
						})
						.optional(),
					filterValue: z
						.string()
						.meta({
							description: "The value to filter by",
						})
						.optional(),
					filterOperator: z
						.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains"])
						.meta({
							description: "The operator to use for the filter",
						})
						.optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED");
			}
			const orgId =
				ctx.query?.organizationId ||
				(ctx.query?.filterField === "organizationId"
					? ctx.query?.filterValue
					: session.session.activeOrganizationId);
			if (!orgId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_ID_IS_REQUIRED,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: orgId,
			});
			if (!isMember) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			const invitations = await adapter.listInvitations({
				organizationId: orgId,
				limit: ctx.query?.limit ? Number(ctx.query.limit) : undefined,
				offset: ctx.query?.offset ? Number(ctx.query.offset) : undefined,
				sortBy: ctx.query?.sortBy,
				sortOrder: ctx.query?.sortDirection,
				filter: ctx.query?.filterField
					? {
							field: ctx.query.filterField,
							operator: ctx.query?.filterOperator,
							value: ctx.query?.filterValue,
						}
					: undefined,
			});
			return ctx.json(invitations);
		},
	);

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
					filterField: z
						.string()
						.meta({
							description: "The field to filter by",
						})
						.optional(),
					filterValue: z
						.string()
						.meta({
							description: "The value to filter by",
						})
						.optional(),
					filterOperator: z
						.enum(["eq", "ne", "lt", "lte", "gt", "gte", "contains"])
						.meta({
							description: "The operator to use for the filter",
						})
						.optional(),
					limit: z.coerce
						.number()
						.meta({
							description: "The limit to return",
						})
						.optional(),
					offset: z.coerce
						.number()
						.meta({
							description: "The offset to start from",
						})
						.optional(),
					sortBy: z
						.string()
						.meta({
							description: "The field to sort by",
						})
						.optional(),
					sortDirection: z
						.enum(["asc", "desc"])
						.meta({
							description: "The direction to sort by",
						})
						.optional(),
				})
				.optional(),
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (ctx.request && ctx.query?.email) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_EMAIL_CANNOT_BE_PASSED_FOR_CLIENT_SIDE_API_CALLS,
				});
			}
			const userEmail = session?.user.email || ctx.query?.email;
			if (!userEmail) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.MISSING_SESSION_HEADERS_OR_EMAIL_QUERY_PARAMETER,
				});
			}
			if (
				ctx.query?.filterField === "email" &&
				ctx.query?.filterValue !== userEmail &&
				(ctx.request || ctx.headers)
			) {
				throw new APIError("FORBIDDEN");
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitations = await adapter.listUserInvitations(userEmail, {
				limit: ctx.query?.limit ? Number(ctx.query.limit) : undefined,
				offset: ctx.query?.offset ? Number(ctx.query.offset) : undefined,
				sortBy: ctx.query?.sortBy,
				sortOrder: ctx.query?.sortDirection,
				filter: ctx.query?.filterField
					? {
							field: ctx.query.filterField,
							operator: ctx.query?.filterOperator,
							value: ctx.query?.filterValue,
						}
					: undefined,
			});
			return ctx.json(invitations);
		},
	);
