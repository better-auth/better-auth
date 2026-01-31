import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../../api";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const listUserTeamsQuerySchema = z
	.object({
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
	})
	.optional();

export const listUserTeams = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/list-user-teams",
		{
			method: "GET",
			query: listUserTeamsQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "listUserTeams",
					description:
						"List all teams that the current user is a part of with pagination",
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
													"Array of team objects that the user is a member of",
											},
											total: {
												type: "number",
												description:
													"Total count of teams the user is a member of",
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
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const result = await teamAdapter.listTeamsByUser({
				userId: session.user.id,
				limit: ctx.query?.limit,
				offset: ctx.query?.offset,
			});
			return ctx.json(result);
		},
	);
};
