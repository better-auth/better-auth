import * as z from "zod";
import { createAuthEndpoint } from "@better-auth/core/middleware";
import { getOrgAdapter } from "../../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../../call";
import {
	type InferOrganizationRolesFromOption,
	type Invitation,
} from "../../schema";
import { APIError } from "better-call";
import { parseRoles } from "../../organization";
import { type OrganizationOptions } from "../../types";
import { ORGANIZATION_ERROR_CODES } from "../../error-codes";
import { hasPermission } from "../../has-permission";
import {
	toZodSchema,
	type InferAdditionalFieldsFromPluginOptions,
} from "../../../../db";
import { getDate } from "../../../../utils/date";
import { BASE_ERROR_CODES } from "@better-auth/core/error";

export const createInvitation = <O extends OrganizationOptions>(option: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: option?.schema?.invitation?.additionalFields || {},
		isClientSide: true,
	});

	const baseSchema = z.object({
		email: z.string().meta({
			description: "The email address of the user to invite",
		}),
		role: z
			.union([
				z.string().meta({
					description: "The role to assign to the user",
				}),
				z.array(
					z.string().meta({
						description: "The roles to assign to the user",
					}),
				),
			])
			.meta({
				description:
					'The role(s) to assign to the user. It can be `admin`, `member`, or `guest`. Eg: "member"',
			}),
		organizationId: z
			.string()
			.meta({
				description: "The organization ID to invite the user to",
			})
			.optional(),
		resend: z
			.boolean()
			.meta({
				description:
					"Resend the invitation email, if the user is already invited. Eg: true",
			})
			.optional(),
		teamId: z.union([
			z
				.string()
				.meta({
					description: "The team ID to invite the user to",
				})
				.optional(),
			z
				.array(z.string())
				.meta({
					description: "The team IDs to invite the user to",
				})
				.optional(),
		]),
	});

	return createAuthEndpoint(
		"/organization/invite-member",
		{
			method: "POST",
			use: [orgMiddleware, orgSessionMiddleware],
			body: z.object({
				...baseSchema.shape,
				...additionalFieldsSchema.shape,
			}),
			metadata: {
				$Infer: {
					body: {} as {
						/**
						 * The email address of the user
						 * to invite
						 */
						email: string;
						/**
						 * The role to assign to the user
						 */
						role:
							| InferOrganizationRolesFromOption<O>
							| InferOrganizationRolesFromOption<O>[];
						/**
						 * The organization ID to invite
						 * the user to
						 */
						organizationId?: string;
						/**
						 * Resend the invitation email, if
						 * the user is already invited
						 */
						resend?: boolean;
					} & (O extends { teams: { enabled: true } }
						? {
								/**
								 * The team the user is
								 * being invited to.
								 */
								teamId?: string | string[];
							}
						: {}) &
						InferAdditionalFieldsFromPluginOptions<"invitation", O, false>,
				},
				openapi: {
					description: "Invite a user to an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: {
												type: "string",
											},
											email: {
												type: "string",
											},
											role: {
												type: "string",
											},
											organizationId: {
												type: "string",
											},
											inviterId: {
												type: "string",
											},
											status: {
												type: "string",
											},
											expiresAt: {
												type: "string",
											},
										},
										required: [
											"id",
											"email",
											"role",
											"organizationId",
											"inviterId",
											"status",
											"expiresAt",
										],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const isEmail = z.email().safeParse(ctx.body.email);
			if (!isEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}
			const session = ctx.context.session;
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.NOT_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			const canInvite = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						invitation: ["create"],
					},
					organizationId,
				},
				ctx,
			);

			if (!canInvite) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION,
				});
			}

			const creatorRole = ctx.context.orgOptions.creatorRole || "owner";

			const roles = parseRoles(ctx.body.role as string | string[]);

			if (
				member.role !== creatorRole &&
				roles.split(",").includes(creatorRole)
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE,
				});
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: ctx.body.email,
				organizationId: organizationId,
			});
			if (alreadyInvited.length && !ctx.body.resend) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION,
				});
			}

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			// If resend is true and there's an existing invitation, reuse it
			if (alreadyInvited.length && ctx.body.resend) {
				const existingInvitation = alreadyInvited[0];
				if (!existingInvitation) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					});
				}

				// Update the invitation's expiration date using the same logic as createInvitation
				const defaultExpiration = 60 * 60 * 48; // 48 hours in seconds
				const newExpiresAt = getDate(
					ctx.context.orgOptions.invitationExpiresIn || defaultExpiration,
					"sec",
				);

				await ctx.context.adapter.update({
					model: "invitation",
					where: [
						{
							field: "id",
							value: existingInvitation.id,
						},
					],
					update: {
						expiresAt: newExpiresAt,
					},
				});

				const updatedInvitation = {
					...existingInvitation,
					expiresAt: newExpiresAt,
				};

				await ctx.context.orgOptions.sendInvitationEmail?.(
					{
						id: updatedInvitation.id,
						role: updatedInvitation.role as string,
						email: updatedInvitation.email.toLowerCase(),
						organization: organization,
						inviter: {
							...member,
							user: session.user,
						},
						invitation: updatedInvitation as unknown as Invitation,
					},
					ctx.request,
				);

				return ctx.json(updatedInvitation);
			}

			if (
				alreadyInvited.length &&
				ctx.context.orgOptions.cancelPendingInvitationsOnReInvite
			) {
				const invitation = alreadyInvited[0];
				if (!invitation) {
					throw new APIError("BAD_REQUEST", {
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					});
				}
				await adapter.updateInvitation({
					invitationId: invitation.id,
					status: "canceled",
				});
			}

			const invitationLimit =
				typeof ctx.context.orgOptions.invitationLimit === "function"
					? await ctx.context.orgOptions.invitationLimit(
							{
								user: session.user,
								organization,
								member: member,
							},
							ctx.context,
						)
					: (ctx.context.orgOptions.invitationLimit ?? 100);

			const pendingInvitations = await adapter.findPendingInvitations({
				organizationId: organizationId,
			});

			if (pendingInvitations.length >= invitationLimit) {
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
				});
			}

			if (
				ctx.context.orgOptions.teams &&
				ctx.context.orgOptions.teams.enabled &&
				typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
					"undefined" &&
				"teamId" in ctx.body &&
				ctx.body.teamId
			) {
				const teamIds =
					typeof ctx.body.teamId === "string"
						? [ctx.body.teamId as string]
						: (ctx.body.teamId as string[]);

				for (const teamId of teamIds) {
					const team = await adapter.findTeamById({
						teamId,
						organizationId: organizationId,
						includeTeamMembers: true,
					});

					if (!team) {
						throw new APIError("BAD_REQUEST", {
							message: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
						});
					}

					const maximumMembersPerTeam =
						typeof ctx.context.orgOptions.teams.maximumMembersPerTeam ===
						"function"
							? await ctx.context.orgOptions.teams.maximumMembersPerTeam({
									teamId,
									session: session,
									organizationId: organizationId,
								})
							: ctx.context.orgOptions.teams.maximumMembersPerTeam;
					if (team.members.length >= maximumMembersPerTeam) {
						throw new APIError("FORBIDDEN", {
							message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
						});
					}
				}
			}

			const teamIds: string[] =
				"teamId" in ctx.body
					? typeof ctx.body.teamId === "string"
						? [ctx.body.teamId as string]
						: ((ctx.body.teamId as string[]) ?? [])
					: [];

			const {
				email: _,
				role: __,
				organizationId: ___,
				resend: ____,
				...additionalFields
			} = ctx.body;

			let invitationData = {
				role: roles,
				email: ctx.body.email.toLowerCase(),
				organizationId: organizationId,
				teamIds,
				...(additionalFields ? additionalFields : {}),
			};

			if (option?.organizationHooks?.beforeCreateInvitation) {
				const response = await option?.organizationHooks.beforeCreateInvitation(
					{
						invitation: {
							...invitationData,
							inviterId: session.user.id,
							teamId: teamIds.length > 0 ? teamIds[0] : undefined,
						},
						inviter: session.user,
						organization,
					},
				);
				if (response && typeof response === "object" && "data" in response) {
					invitationData = {
						...invitationData,
						...response.data,
					};
				}
			}

			const invitation = await adapter.createInvitation({
				invitation: invitationData,
				user: session.user,
			});

			await ctx.context.orgOptions.sendInvitationEmail?.(
				{
					id: invitation.id,
					role: invitation.role as string,
					email: invitation.email.toLowerCase(),
					organization: organization,
					inviter: {
						...member,
						user: session.user,
					},
					//@ts-expect-error
					invitation,
				},
				ctx.request,
			);

			if (option?.organizationHooks?.afterCreateInvitation) {
				await option?.organizationHooks.afterCreateInvitation({
					invitation: invitation as unknown as Invitation,
					inviter: session.user,
					organization,
				});
			}

			return ctx.json(invitation);
		},
	);
};
