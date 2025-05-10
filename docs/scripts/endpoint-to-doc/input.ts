//@ts-nocheck
import { createAuthEndpoint } from "./index";
import { z } from "zod";

const { orgMiddleware, orgSessionMiddleware, requestOnlySessionMiddleware } = {
	orgMiddleware: () => {},
	orgSessionMiddleware: () => {},
	requestOnlySessionMiddleware: () => {},
};



export const addMember = createAuthEndpoint(
	"/organization/add-member",
	{
		method: "POST",
		body: z.object({
			userId: z.coerce.string({
				description:
					'The user Id which represents the user to be added as a member. If `null` is provided, then it\'s expected to provide session headers. Eg: "user-id"',
			}),
			role: z.union([z.string(), z.array(z.string())], {
				description:
					'The role(s) to assign to the new member. Eg: ["admin", "sale"]',
			}),
			organizationId: z
				.string({
					description:
						'An optional organization ID to pass. If not provided, will default to the user\'s active organization. Eg: "org-id"',
				})
				.optional(),
			teamId: z
				.string({
					description:
						'An optional team ID to add the member to. Eg: "team-id"',
				})
				.optional(),
		}),
		use: [orgMiddleware],
		metadata: {
			SERVER_ONLY: true,
			$Infer: {
				body: {} as {
					userId: string;
					role:
						| InferOrganizationRolesFromOption<O>
						| InferOrganizationRolesFromOption<O>[];
					organizationId?: string;
				} & (O extends { teams: { enabled: true } }
					? { teamId?: string }
					: {}),
			},
		},
	},
	async (ctx) => {
		const session = ctx.body.userId
			? await getSessionFromCtx<{
					session: {
						activeOrganizationId?: string;
					};
				}>(ctx).catch((e) => null)
			: null;
		const orgId =
			ctx.body.organizationId || session?.session.activeOrganizationId;
		if (!orgId) {
			return ctx.json(null, {
				status: 400,
				body: {
					message: ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				},
			});
		}

		const teamId = "teamId" in ctx.body ? ctx.body.teamId : undefined;
		if (teamId && !ctx.context.orgOptions.teams?.enabled) {
			ctx.context.logger.error("Teams are not enabled");
			throw new APIError("BAD_REQUEST", {
				message: "Teams are not enabled",
			});
		}

		const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);

		const user = await ctx.context.internalAdapter.findUserById(
			ctx.body.userId,
		);

		if (!user) {
			throw new APIError("BAD_REQUEST", {
				message: BASE_ERROR_CODES.USER_NOT_FOUND,
			});
		}

		const alreadyMember = await adapter.findMemberByEmail({
			email: user.email,
			organizationId: orgId,
		});

		if (alreadyMember) {
			throw new APIError("BAD_REQUEST", {
				message:
					ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
			});
		}

		if (teamId) {
			const team = await adapter.findTeamById({
				teamId,
				organizationId: orgId,
			});
			if (!team || team.organizationId !== orgId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
				});
			}
		}

		const membershipLimit = ctx.context.orgOptions?.membershipLimit || 100;
		const members = await adapter.listMembers({ organizationId: orgId });

		if (members.length >= membershipLimit) {
			throw new APIError("FORBIDDEN", {
				message:
					ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
			});
		}

		const createdMember = await adapter.createMember({
			organizationId: orgId,
			userId: user.id,
			role: parseRoles(ctx.body.role as string | string[]),
			createdAt: new Date(),
			...(teamId ? { teamId: teamId } : {}),
		});

		return ctx.json(createdMember);
	},
);