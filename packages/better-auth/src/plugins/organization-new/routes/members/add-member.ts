import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import * as z from "zod/v4";
import { APIError, getSessionFromCtx } from "../../../../api";
import { parseRoles } from "../../access";
import type { TeamsAddon } from "../../addons";
import { TEAMS_ERROR_CODES } from "../../addons/teams/helpers/errors";
import type { RealTeamId } from "../../addons/teams/helpers/get-team-adapter";
import { getTeamAdapter } from "../../addons/teams/helpers/get-team-adapter";
import { getHook as getTeamHook } from "../../addons/teams/helpers/get-team-hook";
import { resolveTeamOptions } from "../../addons/teams/helpers/resolve-team-options";
import { buildEndpointSchema } from "../../helpers/build-endpoint-schema";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getHook } from "../../helpers/get-hook";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { getOrganizationId } from "../../helpers/get-organization-id";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware } from "../../middleware";
import type { OrganizationOptions } from "../../types";

const baseMemberSchema = z.object({
	userId: z.coerce.string().meta({
		description:
			'The user Id which represents the user to be added as a member. If `null` is provided, then it\'s expected to provide session headers. Eg: "user-id"',
	}),
	role: z.union([z.string(), z.array(z.string())]).meta({
		description:
			'The role(s) to assign to the new member. Eg: ["admin", "sale"]',
	}),
	organizationId: z
		.string()
		.meta({
			description:
				'An optional organization ID to pass. If not provided, will default to the user\'s active organization. Eg: "org-id"',
		})
		.optional(),
	teamId: z
		.string()
		.meta({
			description: 'An optional team ID to add the member to. Eg: "team-id"',
		})
		.optional(),
});

export type AddMember<O extends OrganizationOptions> = ReturnType<
	typeof addMember<O>
>;

export const addMember = <O extends OrganizationOptions>(_options: O) => {
	const options = resolveOrgOptions(_options);

	const { $Infer, schema, getBody } = buildEndpointSchema({
		baseSchema: baseMemberSchema,
		additionalFieldsSchema: _options?.schema as O["schema"],
		additionalFieldsModel: "member",
	});

	return createAuthEndpoint(
		{
			method: "POST",
			body: schema,
			use: [orgMiddleware],
			metadata: {
				$Infer,
				openapi: {
					operationId: "addOrganizationMember",
					description: "Add a member to an organization",
				},
			},
		},
		async (ctx) => {
			const body = getBody(ctx);

			const roleIsEmpty =
				!body.role || (Array.isArray(body.role) && body.role.length === 0);

			if (roleIsEmpty) {
				throw APIError.fromStatus("BAD_REQUEST");
			}

			const orgId = await getOrganizationId({ ctx });
			const adapter = getOrgAdapter<O>(ctx.context, _options);
			const realOrgId = await adapter.getRealOrganizationId(orgId);

			// Check if teams addon is enabled when teamId is provided
			const teamId = "teamId" in body ? (body.teamId as string) : undefined;
			const teamsAddon = options.use.find((addon) => addon.id === "teams") as
				| TeamsAddon
				| undefined;

			if (teamId && !teamsAddon) {
				ctx.context.logger.error("Teams are not enabled");
				const msg = TEAMS_ERROR_CODES.TEAMS_ARE_NOT_ENABLED;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const user = await ctx.context.internalAdapter.findUserById(body.userId);

			if (!user) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email: user.email,
				organizationId: realOrgId,
			});

			if (alreadyMember) {
				const code = "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			// Validate team exists and check team member limits if teamId is provided
			let team: Awaited<
				ReturnType<ReturnType<typeof getTeamAdapter>["findTeamById"]>
			> = null;
			let realTeamId: RealTeamId | undefined;

			if (teamId && teamsAddon) {
				const teamOptions = resolveTeamOptions(teamsAddon.options);
				const teamAdapter = getTeamAdapter(ctx.context, teamOptions);

				realTeamId = await teamAdapter.getRealTeamId(teamId);
				team = await teamAdapter.findTeamById({
					teamId,
					organizationId: realOrgId,
				});

				if (!team) {
					const msg = ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND;
					throw APIError.from("BAD_REQUEST", msg);
				}

				// Check maximum members per team limit
				const session = await getSessionFromCtx(ctx);
				if (session) {
					const memberCount = await teamAdapter.countTeamMembers(realTeamId);
					const maxMembers = await teamOptions.maximumMembersPerTeam({
						teamId: realTeamId,
						session,
						organizationId: realOrgId,
					});

					if (memberCount >= maxMembers) {
						const code = "TEAM_MEMBER_LIMIT_REACHED";
						const msg = ORGANIZATION_ERROR_CODES[code];
						throw APIError.from("FORBIDDEN", msg);
					}
				}
			}

			const membershipLimit = options.membershipLimit;
			const count = await adapter.countMembers({ organizationId: realOrgId });

			const organization = await adapter.findOrganizationById(orgId);
			if (!organization) {
				const msg = ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}

			const limit = await membershipLimit(user, organization, ctx);

			if (count >= limit) {
				const code = "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const {
				role: _,
				userId: __,
				organizationId: ___,
				teamId: ____,
				...additionalFields
			} = body;

			let memberData = {
				organizationId: orgId,
				userId: user.id,
				role: parseRoles(body.role),
				createdAt: new Date(),
				...(additionalFields ? additionalFields : {}),
			};

			const addMemberHook = getHook("AddMember", options);

			const modify = await addMemberHook.before(
				{
					member: {
						userId: user.id,
						organizationId: orgId,
						role: parseRoles(body.role as string | string[]),
						...additionalFields,
					},
					user,
					organization,
				},
				ctx,
			);

			if (modify) {
				memberData = {
					...memberData,
					...modify,
				};
			}

			const createdMember = await adapter.createMember(memberData);

			// Add user to team if teamId is provided and teams addon is enabled
			if (teamId && teamsAddon && realTeamId && team) {
				const teamOptions = resolveTeamOptions(teamsAddon.options);
				const teamAdapter = getTeamAdapter(ctx.context, teamOptions);
				const addTeamMemberHook = getTeamHook("AddTeamMember", teamOptions);

				let teamMemberData = {
					teamId: realTeamId,
					userId: user.id,
				};

				const teamModify = await addTeamMemberHook.before(
					{
						teamMember: teamMemberData,
						team,
						user,
						organization,
					},
					ctx,
				);

				if (teamModify) {
					teamMemberData = {
						...teamMemberData,
						...teamModify,
					};
				}

				const teamMember = await teamAdapter.createTeamMember(
					teamMemberData as { teamId: RealTeamId; userId: string },
				);

				if (teamMember) {
					await addTeamMemberHook.after(
						{
							teamMember,
							team,
							user,
							organization,
						},
						ctx,
					);
				}
			}

			await addMemberHook.after(
				{
					member: createdMember,
					user,
					organization,
				},
				ctx,
			);

			return ctx.json(createdMember);
		},
	);
};
