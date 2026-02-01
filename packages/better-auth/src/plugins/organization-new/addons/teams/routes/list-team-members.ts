import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../../api";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const listTeamMembersQuerySchema = z
	.object({
		teamId: z
			.string()
			.meta({
				description:
					"The team whose members we should return. If this is not provided the members of the current active team get returned.",
			})
			.optional(),
		limit: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.meta({
				description: "Maximum number of team members to return (1-100)",
			})
			.optional(),
		offset: z.coerce
			.number()
			.int()
			.min(0)
			.meta({
				description: "Number of team members to skip for pagination",
			})
			.optional(),
		sortBy: z
			.enum(["createdAt"])
			.meta({
				description: "Field to sort by. Defaults to createdAt",
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

export const listTeamMembers = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/list-team-members",
		{
			method: "GET",
			query: listTeamMembersQuerySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "listTeamMembers",
					description:
						"List the members of the given team with pagination support",
					responses: {
						"200": {
							description: "Team members retrieved successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											members: {
												type: "array",
												items: {
													type: "object",
													description: "The team member",
													properties: {
														id: {
															type: "string",
															description:
																"Unique identifier of the team member",
														},
														userId: {
															type: "string",
															description: "The user ID of the team member",
														},
														teamId: {
															type: "string",
															description:
																"The team ID of the team the team member is in",
														},
														createdAt: {
															type: "string",
															format: "date-time",
															description:
																"Timestamp when the team member was created",
														},
													},
													required: ["id", "userId", "teamId", "createdAt"],
												},
												description:
													"Array of team member objects within the team",
											},
											total: {
												type: "number",
												description: "Total count of members in the team",
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
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const teamId = ctx.query?.teamId || session.session.activeTeamId;
			if (!teamId) {
				const code = "YOU_DO_NOT_HAVE_AN_ACTIVE_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const realTeamId = await teamAdapter.getRealTeamId(teamId);

			const member = await teamAdapter.findTeamMember({
				userId: session.user.id,
				teamId: realTeamId,
			});

			if (!member) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const result = await teamAdapter.listTeamMembers({
				teamId: realTeamId,
				limit: ctx.query?.limit,
				offset: ctx.query?.offset,
				sortBy: ctx.query?.sortBy,
				sortDirection: ctx.query?.sortDirection,
			});

			return ctx.json(result);
		},
	);
};
