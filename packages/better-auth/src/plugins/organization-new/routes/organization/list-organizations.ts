import { createAuthEndpoint } from "@better-auth/core/api";
import * as z from "zod";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type { InferOrganization, OrganizationOptions } from "../../types";

export type ListOrganizations<O extends OrganizationOptions> = ReturnType<
	typeof listOrganizations<O>
>;

const listOrganizationsQuerySchema = z
	.object({
		limit: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "The maximum number of organizations to return",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.nonnegative()
			.meta({
				description: "The number of organizations to skip",
			})
			.optional(),
	})
	.optional();

export const listOrganizations = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list",
		{
			method: "GET",
			query: listOrganizationsQuerySchema,
			use: [orgMiddleware, orgSessionMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					description: "List all organizations the current user is a member of",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											organizations: {
												type: "array",
												items: {
													$ref: "#/components/schemas/Organization",
												},
											},
											total: {
												type: "number",
												description: "Total number of organizations",
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
										required: ["organizations", "total"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const userId = ctx.context.session.user.id;
			const limit = (() => {
				if (ctx.query?.limit != null) {
					return Number(ctx.query.limit);
				}
				if (typeof options.membershipLimit === "number") {
					return options.membershipLimit;
				}
				return 100;
			})();
			const offset = (() => {
				if (ctx.query?.offset != null) {
					return Number(ctx.query.offset);
				}
				return 0;
			})();

			const { organizations, total } = await adapter.listOrganizations(userId, {
				limit,
				offset,
			});

			return ctx.json({
				organizations: organizations as unknown as InferOrganization<O>[],
				total,
				limit,
				offset,
			});
		},
	);
