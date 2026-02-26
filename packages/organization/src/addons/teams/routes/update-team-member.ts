import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { getSessionFromCtx } from "better-auth/api";
import * as z from "zod/v4";
import { hasPermission } from "../../../access";
import { buildEndpointSchema } from "../../../helpers/build-endpoint-schema";
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

const baseUpdateTeamMemberSchema = z.object({
	teamId: z.string().meta({
		description: 'The ID of the team the member belongs to. Eg: "team-id"',
	}),
	userId: z.coerce.string().meta({
		description:
			'The ID of the user whose team membership should be updated. Eg: "user-id"',
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID. If not provided, will default to the user\'s active organization. Eg: "org-id"',
		})
		.optional(),
	data: z.object({}),
});

export const updateTeamMember = <O extends TeamsOptions>(_options?: O) => {
	const options = resolveTeamOptions(_options);

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseUpdateTeamMemberSchema,
		additionalFieldsSchema: options?.schema as O["schema"],
		additionalFieldsModel: "teamMember",
		additionalFieldsNestedAs: "data",
		shouldBePartial: true,
	});

	return createAuthEndpoint(
		"/organization/update-team-member",
		{
			method: "POST",
			body: schema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				$Infer,
				openapi: {
					operationId: "updateTeamMember",
					description: "Update an existing team member in a team",
					responses: {
						"200": {
							description: "Team member updated successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
												description:
													"Unique identifier of the updated team member",
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
			const body = getBody(ctx);
			const session = await getSessionFromCtx(ctx);
			if (!session) throw APIError.fromStatus("UNAUTHORIZED");

			const orgAdapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const teamAdapter = getTeamAdapter<O>(ctx.context, options);
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
				const code = "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_TEAM_MEMBER";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const team = await teamAdapter.findTeamById({
				teamId: body.teamId,
				organizationId: realOrgId,
			});

			if (!team) {
				const msg = TEAMS_ERROR_CODES.TEAM_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Use the org-scoped team.id to ensure we operate on the correct team
			const realTeamId = team.id as unknown as RealTeamId;

			const organization = await orgAdapter.findOrganizationById(realOrgId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const existingTeamMember = await teamAdapter.findTeamMember({
				teamId: realTeamId,
				userId: body.userId,
			});

			if (!existingTeamMember) {
				const code = "USER_IS_NOT_A_MEMBER_OF_THE_TEAM";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const userBeingUpdated = await ctx.context.internalAdapter.findUserById(
				body.userId,
			);
			if (!userBeingUpdated) {
				const code = "MEMBER_NOT_FOUND";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			const updateTeamMemberHook = getHook("UpdateTeamMember");

			let updates: Record<string, any> = { ...body.data };

			const modify = await updateTeamMemberHook.before(
				{
					teamMember: existingTeamMember,
					updates,
					team,
					user: userBeingUpdated,
					organization,
				},
				ctx,
			);

			if (modify) {
				updates = {
					...updates,
					...modify,
				};
			}

			const updatedTeamMember = await teamAdapter.updateTeamMember({
				teamId: realTeamId,
				userId: body.userId,
				data: updates,
			});

			if (!updatedTeamMember) {
				ctx.context.logger.error("Failed to update team member");
				const msg = TEAMS_ERROR_CODES.FAILED_TO_UPDATE_TEAM_MEMBER;
				throw APIError.from("INTERNAL_SERVER_ERROR", msg);
			}

			await updateTeamMemberHook.after(
				{
					teamMember: updatedTeamMember,
					team,
					user: userBeingUpdated,
					organization,
				},
				ctx,
			);

			return ctx.json(updatedTeamMember);
		},
	);
};
