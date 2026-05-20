import { createAuthEndpoint } from "@better-auth/core/api";
import { whereOperators } from "@better-auth/core/db/adapter";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const listMembersQuerySchema = z
	.object({
		organizationId: z
			.string()
			.meta({
				description:
					'The organization ID to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-id"',
			})
			.optional(),
		organizationSlug: z
			.string()
			.meta({
				description:
					'The organization slug to list members for. If not provided, will default to the user\'s active organization. Eg: "organization-slug"',
			})
			.optional(),
		limit: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "The maximum number of members to return",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "The number of members to skip for pagination",
			})
			.optional(),
		sortBy: z
			.enum(["createdAt", "role", "userId"])
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
			.enum(["role", "userId", "createdAt"])
			.meta({
				description: "The field to filter by",
			})
			.optional(),
		filterValue: z
			.string()
			.meta({
				description: "The value to filter by",
			})
			.or(z.number())
			.or(z.boolean())
			.or(z.array(z.string()))
			.or(z.array(z.number()))
			.optional(),
		filterOperator: z
			.enum(whereOperators)
			.meta({
				description: "The operator to use for the filter",
			})
			.optional(),
	})
	.optional();

export type ListMembers<O extends OrganizationOptions> = ReturnType<
	typeof listMembers<O>
>;

export const listMembers = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-members",
		{
			method: "GET",
			query: listMembersQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "List members of an organization with pagination",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											members: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: { type: "string" },
														userId: { type: "string" },
														organizationId: { type: "string" },
														role: { type: "string" },
														createdAt: { type: "string" },
														user: {
															type: "object",
															properties: {
																id: { type: "string" },
																name: { type: "string" },
																email: { type: "string" },
																image: { type: "string" },
															},
														},
													},
													required: ["id", "userId", "organizationId", "role"],
												},
											},
											total: {
												type: "number",
												description: "Total count of members",
											},
											limit: {
												type: "number",
												nullable: true,
												description: "The limit used for pagination",
											},
											offset: {
												type: "number",
												nullable: true,
												description: "The offset used for pagination",
											},
										},
										required: ["members", "total"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter<O>(ctx.context, options);

			let organizationId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			if (ctx.query?.organizationSlug) {
				const organization = await adapter.findOrganizationById(
					ctx.query.organizationSlug,
					"slug",
				);
				if (!organization) {
					const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
					throw APIError.from("BAD_REQUEST", msg);
				}
				organizationId = organization.id;
			}
			if (!organizationId) {
				const msg = ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION;
				throw APIError.from("BAD_REQUEST", msg);
			}
			const realOrgId = await adapter.getRealOrganizationId(organizationId);

			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!isMember) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const limit = ctx.query?.limit ? Number(ctx.query.limit) : undefined;
			const offset = ctx.query?.offset ? Number(ctx.query.offset) : undefined;

			const { members, total } = await adapter.listMembers({
				organizationId: realOrgId,
				limit,
				offset,
				sortBy: ctx.query?.sortBy,
				sortOrder: ctx.query?.sortDirection,
				filter: ctx.query?.filterField
					? {
							field: ctx.query.filterField,
							operator: ctx.query.filterOperator,
							value: ctx.query.filterValue,
						}
					: undefined,
			});

			return ctx.json({
				members,
				total,
				limit: limit ?? null,
				offset: offset ?? null,
			});
		},
	);
