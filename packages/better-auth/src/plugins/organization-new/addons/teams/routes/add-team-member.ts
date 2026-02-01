import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import * as z from "zod/v4";
import { getSessionFromCtx } from "../../../../../api";
import { hasPermission } from "../../../access";
import { ORGANIZATION_ERROR_CODES } from "../../../helpers/error-codes";
import { getOrgAdapter } from "../../../helpers/get-org-adapter";
import { getOrganizationId } from "../../../helpers/get-organization-id";
import { orgMiddleware } from "../../../middleware/org-middleware";
import { TEAMS_ERROR_CODES } from "../helpers/errors";
import type { RealTeamId } from "../helpers/get-team-adapter";
import { getTeamAdapter } from "../helpers/get-team-adapter";
import { getHook } from "../helpers/get-team-hook";
import { resolveTeamOptions } from "../helpers/resolve-team-options";
import type { TeamsOptions } from "../types";

const addTeamMemberBodySchema = z.object({
	teamId: z.string().meta({
		description: "The team the user should be a member of.",
	}),
	userId: z.coerce.string().meta({
		description:
			"The user Id which represents the user to be added as a member.",
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID. If not provided, will default to the user\'s active organization. Eg: "org-id"',
		})
		.optional(),
});

export const addTeamMember = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	return createAuthEndpoint(
		"/organization/add-team-member",
		{
			method: "POST",
			body: addTeamMemberBodySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					operationId: "addTeamMember",
					description: "Add a member to a team",
					responses: {
						"200": {
							description: "Team member created successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										description: "The team member",
										properties: {
											id: {
												type: "string",
												description: "Unique identifier of the team member",
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
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const teamAdapter = getTeamAdapter(ctx.context, options);
			const orgId = await getOrganizationId({ ctx });
			const realOrgId = await orgAdapter.getRealOrganizationId(orgId);

			const currentMember = await orgAdapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: realOrgId,
			});

			if (!currentMember) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const canUpdateMember = await hasPermission(
				{
					role: currentMember.role,
					options: ctx.context.orgOptions,
					permissions: {
						member: ["update"],
					},
					organizationId: realOrgId,
				},
				ctx,
			);

			if (!canUpdateMember) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_TEAM_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const toBeAddedMember = await orgAdapter.findMemberByOrgId({
				userId: ctx.body.userId,
				organizationId: realOrgId,
			});

			if (!toBeAddedMember) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const realTeamId = await teamAdapter.getRealTeamId(ctx.body.teamId);

			const team = await teamAdapter.findTeamById({
				teamId: ctx.body.teamId,
				organizationId: realOrgId,
			});

			if (!team) {
				const msg = TEAMS_ERROR_CODES.TEAM_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const organization = await orgAdapter.findOrganizationById(realOrgId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const userBeingAdded = await ctx.context.internalAdapter.findUserById(
				ctx.body.userId,
			);
			if (!userBeingAdded) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Check if user is already a member of the team
			const existingTeamMember = await teamAdapter.findTeamMember({
				teamId: realTeamId,
				userId: ctx.body.userId,
			});

			if (existingTeamMember) {
				const code = "USER_IS_ALREADY_A_MEMBER_OF_THIS_TEAM";
				const msg = TEAMS_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Check maximum members per team limit
			const { total: memberCount } = await teamAdapter.listTeamMembers({
				teamId: realTeamId,
			});
			const maxMembers = await options.maximumMembersPerTeam({
				teamId: realTeamId,
				session,
				organizationId: realOrgId,
			});

			if (memberCount >= maxMembers) {
				const code = "TEAM_MEMBER_LIMIT_REACHED";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const addTeamMemberHook = getHook("AddTeamMember", options);

			let teamMemberData = {
				teamId: realTeamId,
				userId: ctx.body.userId,
			};

			const modify = await addTeamMemberHook.before(
				{
					teamMember: teamMemberData,
					team,
					user: userBeingAdded,
					organization,
				},
				ctx,
			);

			if (modify) {
				teamMemberData = {
					...teamMemberData,
					...modify,
				};
			}

			const teamMember = await teamAdapter.createTeamMember(
				teamMemberData as { teamId: RealTeamId; userId: string },
			);

			if (!teamMember) {
				ctx.context.logger.error("Failed to create team member");
				const msg = TEAMS_ERROR_CODES.FAILED_TO_CREATE_TEAM_MEMBER;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			await addTeamMemberHook.after(
				{
					teamMember,
					team,
					user: userBeingAdded,
					organization,
				},
				ctx,
			);

			return ctx.json(teamMember);
		},
	);
};
