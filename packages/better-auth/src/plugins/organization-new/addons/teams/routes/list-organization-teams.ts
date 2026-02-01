import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../../api";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const listOrganizationTeamsQuerySchema = z
	.object({
		organizationId: z
			.string()
			.meta({
				description:
					'The organization ID which the teams are under to list. Defaults to the users active organization. Eg: "organization-id"',
			})
			.optional(),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.meta({
				description: "Maximum number of teams to return (1-100)",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.min(0)
			.meta({
				description: "Number of teams to skip for pagination",
			})
			.optional(),
		sortBy: z
			.enum(["createdAt", "name", "updatedAt"])
			.meta({
				description:
					"Field to sort by. Defaults to createdAt. Options: createdAt, name, updatedAt",
			})
			.optional(),
		sortDirection: z
			.enum(["asc", "desc"])
			.meta({
				description: "Sort direction. Defaults to desc",
			})
			.optional(),
	})
	.optional();

export const listOrganizationTeams = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/list-teams",
		{
			method: "GET",
			query: listOrganizationTeamsQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "listOrganizationTeams",
					description: "List all teams in an organization with pagination",
					responses: {
						"200": {
							description: "Teams retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											teams: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: {
															type: "string",
															description: "Unique identifier of the team",
														},
														name: {
															type: "string",
															description: "Name of the team",
														},
														organizationId: {
															type: "string",
															description:
																"ID of the organization the team belongs to",
														},
														createdAt: {
															type: "string",
															format: "date-time",
															description:
																"Timestamp when the team was created",
														},
														updatedAt: {
															type: "string",
															format: "date-time",
															description:
																"Timestamp when the team was last updated",
														},
													},
													required: [
														"id",
														"name",
														"organizationId",
														"createdAt",
														"updatedAt",
													],
												},
												description:
													"Array of team objects within the organization",
											},
											total: {
												type: "number",
												description: "Total count of teams in the organization",
											},
										},
										required: ["teams", "total"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const organizationId = await getOrganizationId({ ctx });
			const realOrgId = await adapter.getRealOrganizationId(organizationId);

			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const result = await teamAdapter.listTeams({
				organizationId: realOrgId,
				limit: ctx.query?.limit,
				offset: ctx.query?.offset,
				sortBy: ctx.query?.sortBy,
				sortDirection: ctx.query?.sortDirection,
			});
			return ctx.json(result);
		},
	);
};
