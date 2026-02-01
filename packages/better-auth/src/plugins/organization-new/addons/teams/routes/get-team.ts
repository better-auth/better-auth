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

const getTeamQuerySchema = z.object({
	teamId: z.string().meta({
		description:
			"The ID of the team to retrieve. Can be the team's id or slug based on the defaultTeamIdField configuration.",
	}),
	organizationId: z
		.string()
		.meta({
			description:
				"The organization ID which the team belongs to. Can be the organization's id or slug based on the defaultOrganizationIdField configuration. If not provided, defaults to the active organization.",
		})
		.optional(),
});

export const getTeam = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/get-team",
		{
			method: "GET",
			query: getTeamQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "getOrganizationTeam",
					description: "Get a team by its ID or slug",
					responses: {
						"200": {
							description: "Team retrieved successfully",
							content: {
								"application/json": {
									schema: {
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
											slug: {
												type: "string",
												description: "URL-friendly slug of the team",
											},
											createdAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the team was created",
											},
											updatedAt: {
												type: "string",
												format: "date-time",
												description: "Timestamp when the team was last updated",
											},
										},
										required: ["id", "name", "organizationId", "createdAt"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const organizationId = await getOrganizationId({ ctx });
			const realOrgId = await orgAdapter.getRealOrganizationId(organizationId);

			// Check that user is a member of the organization
			const member = await orgAdapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!member) {
				const code = "YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const team = await teamAdapter.findTeamById({
				teamId: ctx.query.teamId,
				organizationId: realOrgId,
			});

			if (!team || team.organizationId !== realOrgId.toString()) {
				const code = "TEAM_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			return ctx.json(team);
		},
	);
};
