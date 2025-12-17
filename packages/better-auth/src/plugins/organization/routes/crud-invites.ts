import { createAuthEndpoint } from "@better-auth/core/api";
import { BASE_ERROR_CODES } from "@better-auth/core/error";
import { APIError } from "better-call";
import * as z from "zod";
import { getSessionFromCtx } from "../../../api/routes";
import { setSessionCookie } from "../../../cookies";
import type { InferAdditionalFieldsFromPluginOptions } from "../../../db";
import { toZodSchema } from "../../../db";
import { getDate } from "../../../utils/date";
import { defaultRoles } from "../access/statement";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware, orgSessionMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import { parseRoles } from "../organization";
import type {
	InferInvitation,
	InferOrganizationRolesFromOption,
	Invitation,
	Member,
} from "../schema";
import type { OrganizationOptions } from "../types";

const baseInvitationSchema = z.object({
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
				'The role(s) to assign to the user. It can be `admin`, `member`, owner. Eg: "member"',
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

export const createInvitation = <O extends OrganizationOptions>(option: O) => {
	const additionalFieldsSchema = toZodSchema({
		fields: option?.schema?.invitation?.additionalFields || {},
		isClientSide: true,
	});

	return createAuthEndpoint(
		"/organization/invite-member",
		{
			method: "POST",
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			body: z.object({
				...baseInvitationSchema.shape,
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
						organizationId?: string | undefined;
						/**
						 * Resend the invitation email, if
						 * the user is already invited
						 */
						resend?: boolean | undefined;
					} & (O extends { teams: { enabled: true } }
						? {
								/**
								 * The team the user is
								 * being invited to.
								 */
								teamId?: (string | string[]) | undefined;
							}
						: {}) &
						InferAdditionalFieldsFromPluginOptions<"invitation", O, false>,
				},
				openapi: {
					operationId: "createOrganizationInvitation",
					description: "Create an invitation to an organization",
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
											createdAt: {
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
											"createdAt",
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
			const session = ctx.context.session;
			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw new APIError("BAD_REQUEST", {
					message: BASE_ERROR_CODES.INVALID_EMAIL,
				});
			}

			const adapter = getOrgAdapter<O>(ctx.context, option as O);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
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

			const roles = parseRoles(ctx.body.role);

			const rolesArray = roles
				.split(",")
				.map((r) => r.trim())
				.filter(Boolean);
			const defaults = Object.keys(defaultRoles);
			const customRoles = Object.keys(ctx.context.orgOptions.roles || {});
			const validStaticRoles = new Set([...defaults, ...customRoles]);

			const unknownRoles = rolesArray.filter(
				(role) => !validStaticRoles.has(role),
			);

			if (unknownRoles.length > 0) {
				if (ctx.context.orgOptions.dynamicAccessControl?.enabled) {
					const foundRoles = await ctx.context.adapter.findMany({
						model: "organizationRole",
						where: [
							{ field: "organizationId", value: organizationId },
							{ field: "role", value: unknownRoles, operator: "in" },
						],
					});
					const foundRoleNames = foundRoles.map((r: any) => r.role);
					const stillInvalid = unknownRoles.filter(
						(r) => !foundRoleNames.includes(r),
					);

					if (stillInvalid.length > 0) {
						throw new APIError("BAD_REQUEST", {
							message: `${ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND}: ${stillInvalid.join(", ")}`,
						});
					}
				} else {
					throw new APIError("BAD_REQUEST", {
						message: `${ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND}: ${unknownRoles.join(", ")}`,
					});
				}
			}

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
				email: email,
				organizationId: organizationId,
			});
			if (alreadyMember) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION,
				});
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: email,
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
							value: existingInvitation!.id,
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
						id: updatedInvitation.id!,
						role: updatedInvitation.role! as string,
						email: updatedInvitation.email!.toLowerCase(),
						organization: organization,
						inviter: {
							...member,
							user: session.user,
						},
						invitation: updatedInvitation as unknown as Invitation,
					},
					ctx.request,
				);

				return ctx.json(updatedInvitation as InferInvitation<O, false>);
			}

			if (
				alreadyInvited.length &&
				ctx.context.orgOptions.cancelPendingInvitationsOnReInvite
			) {
				await adapter.updateInvitation({
					invitationId: alreadyInvited[0]!.id,
					status: "canceled",
				});
			}

			const invitationLimit =
				typeof ctx.context.orgOptions.invitationLimit === "function"
					? await ctx.context.orgOptions.invitationLimit(
							{
								user: session.user,
								organization,
								member: member as Member,
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
				email: email,
				organizationId: organizationId,
				teamIds,
				...(additionalFields ? additionalFields : {}),
			};

			// Run beforeCreateInvitation hook
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
					role: invitation.role,
					email: invitation.email.toLowerCase(),
					organization: organization,
					inviter: {
						...(member as Member),
						user: session.user,
					},
					invitation,
				},
				ctx.request,
			);

			// Run afterCreateInvitation hook
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

export const createBulkInvitation = <O extends OrganizationOptions>(
	option: O,
) => {
	const additionalFieldsSchema = toZodSchema({
		fields: option?.schema?.invitation?.additionalFields || {},
		isClientSide: true,
	});
	return createAuthEndpoint(
		"/organization/invite-members",
		{
			method: "POST",
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			body: z.object({
				organizationId: z.string().optional(),
				invitations: z.array(
					z.object({
						...baseInvitationSchema.shape,
						...additionalFieldsSchema.shape,
					}),
				),
			}),
			metadata: {
				$Infer: {
					body: {} as {
						organizationId?: string;
						invitations: Array<{
							email: string;
							role:
								| InferOrganizationRolesFromOption<O>
								| InferOrganizationRolesFromOption<O>[];
							resend?: boolean;
						}> &
							(O extends { teams: { enabled: true } }
								? {
										teamId?: string | string[];
									}
								: {}) &
							InferAdditionalFieldsFromPluginOptions<"invitation", O, false>;
					},
				},
				openapi: {
					operationId: "createOrganizationBulkInvitations",
					description: "Create multiple invitations to an organization",
					responses: {
						"200": {
							description: "Bulk invitation Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: {
												type: "array",
												items: {
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
													createdAt: {
														type: "string",
													},
												},
											},
											failed: {
												type: "array",
												items: {
													email: {
														type: "string",
													},
													reason: {
														type: "string",
													},
												},
											},
											totalProcessed: {
												type: "number",
											},
											totalSuccessful: {
												type: "number",
											},
											totalFailed: {
												type: "number",
											},
										},
										required: [
											"success",
											"failed",
											"totalProcessed",
											"totalSuccessful",
											"totalFailed",
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
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
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

			let validInvitations: any[] = [];
			let invalidInvitations: { email: string; reason: string }[] = [];
			let seenEmails = new Set<string>();

			ctx.body.invitations.forEach((invitation) => {
				const email = invitation.email.toLowerCase();
				const isValidEmail = z.email().safeParse(email);
				if (!isValidEmail.success) {
					invalidInvitations.push({
						email: invitation.email,
						reason: "Invalid email format",
					});
				}
				//filter out the duplicates emails
				// const isEmailDuplicate = ctx.body.invitations
				// 	.slice(0, ctx.body.invitations.indexOf(invitation))
				// 	.some((inv) => inv.email.toLowerCase() === email);
				const isEmailDuplicate = seenEmails.has(email);
				if (isEmailDuplicate) {
					invalidInvitations.push({
						email: invitation.email,
						reason: "Duplicate email in the invitation list",
					});
				}
				if (!isEmailDuplicate && isValidEmail.success) {
					validInvitations.push(invitation);
					seenEmails.add(email);
				}
			});
			const creatorRole = ctx.context.orgOptions.creatorRole || "owner";
			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			validInvitations = validInvitations.filter((invitation) => {
				const roles = parseRoles(invitation.role);
				if (
					member.role !== creatorRole &&
					roles.split(",").includes(creatorRole)
				) {
					invalidInvitations.push({
						email: invitation.email,
						reason: "You are not allowed to invite a user with this role",
					});
					return false; // Remove from validInvitations
				}
				return true; // Keep in validInvitations
			});

			const alreadyMembers = await adapter.findMembersByEmail({
				emails: validInvitations.map((invitation) =>
					invitation.email.toLowerCase(),
				),
				organizationId: organizationId,
			});
			//filter out already members
			alreadyMembers.forEach((member) => {
				validInvitations = validInvitations.filter((invitation) => {
					return (
						invitation.email.toLowerCase() !== member.user.email.toLowerCase()
					);
				});
				invalidInvitations.push({
					email: member.user.email,
					reason: "User is already a member of this organization",
				});
			});

			const allAlreadyInvitedMembers = await adapter.findPendingInvitations({
				organizationId: organizationId,
			});

			// Map of existing invitations by email
			const alreadyInvitedMap = new Map<string, InferInvitation<O, false>>();
			allAlreadyInvitedMembers.forEach((invited) => {
				alreadyInvitedMap.set(invited.email.toLowerCase(), invited);
			});

			let invitationSuccess: any[] = [];
			const invitationsToCancel: string[] = [];

			// Process already invited members
			for (const invitation of validInvitations) {
				const existingInvitation = alreadyInvitedMap.get(
					invitation.email.toLowerCase(),
				);
				if (existingInvitation) {
					if (ctx.context.orgOptions.cancelPendingInvitationsOnReInvite) {
						// Cancel old invitation, will create new one
						invitationsToCancel.push(existingInvitation.id);
					} else if (invitation.resend) {
						// Resend: update expiration and send email
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

						// Send invitation email
						await ctx.context.orgOptions.sendInvitationEmail?.(
							{
								id: updatedInvitation.id!,
								role: updatedInvitation.role! as string,
								email: updatedInvitation.email!.toLowerCase(),
								organization: organization,
								inviter: {
									...member,
									user: session.user,
								},
								invitation: updatedInvitation as unknown as Invitation,
							},
							ctx.request,
						);

						invitationSuccess.push(updatedInvitation);
						// Remove from validInvitations
						validInvitations = validInvitations.filter(
							(inv) =>
								inv.email.toLowerCase() !== invitation.email.toLowerCase(),
						);
					} else {
						// Already invited and not resending
						validInvitations = validInvitations.filter(
							(inv) =>
								inv.email.toLowerCase() !== invitation.email.toLowerCase(),
						);
						invalidInvitations.push({
							email: invitation.email,
							reason: "User is already invited to this organization",
						});
					}
				}
			}

			// Cancel old invitations
			if (invitationsToCancel.length > 0) {
				await adapter.updateInvitations({
					invitationIds: invitationsToCancel,
					status: "canceled",
				});
			}
			const invitationLimit =
				typeof ctx.context.orgOptions.invitationLimit === "function"
					? await ctx.context.orgOptions.invitationLimit(
							{
								user: session.user,
								organization,
								member: member as Member,
							},
							ctx.context,
						)
					: (ctx.context.orgOptions.invitationLimit ?? 100);

			const pendingInvitations = await adapter.findPendingInvitations({
				organizationId: organizationId,
			});

			if (
				pendingInvitations.length + validInvitations.length >
				invitationLimit
			) {
				throw new APIError("FORBIDDEN", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_LIMIT_REACHED,
				});
			}

			// Check team member limits if teams are enabled
			if (
				ctx.context.orgOptions.teams &&
				ctx.context.orgOptions.teams.enabled &&
				typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
					"undefined"
			) {
				const teamIdsToCheck = new Set<string>();
				for (const invitation of validInvitations) {
					if ("teamId" in invitation && invitation.teamId) {
						const teamIds =
							typeof invitation.teamId === "string"
								? [invitation.teamId]
								: invitation.teamId;
						teamIds.forEach((id: string) => teamIdsToCheck.add(id));
					}
				}

				// Check each team's member limit
				for (const teamId of teamIdsToCheck) {
					const team = await adapter.findTeamById({
						teamId,
						organizationId: organizationId,
						includeTeamMembers: true,
					});

					if (!team) {
						// Team not found - mark invitations with this teamId as invalid
						validInvitations = validInvitations.filter((invitation) => {
							if ("teamId" in invitation && invitation.teamId) {
								const invTeamIds =
									typeof invitation.teamId === "string"
										? [invitation.teamId]
										: invitation.teamId;
								if (invTeamIds.includes(teamId)) {
									invalidInvitations.push({
										email: invitation.email,
										reason: ORGANIZATION_ERROR_CODES.TEAM_NOT_FOUND,
									});
									return false;
								}
							}
							return true;
						});
						continue;
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

					const newInvitationsForTeam = validInvitations.filter(
						(invitation) => {
							if ("teamId" in invitation && invitation.teamId) {
								const invTeamIds =
									typeof invitation.teamId === "string"
										? [invitation.teamId]
										: invitation.teamId;
								return invTeamIds.includes(teamId);
							}
							return false;
						},
					).length;

					if (
						team.members.length + newInvitationsForTeam >
						maximumMembersPerTeam
					) {
						throw new APIError("FORBIDDEN", {
							message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
						});
					}
				}
			}

			// Create invitations for remaining valid invitations
			// Step 1: Prepare all invitation data and run beforeCreateInvitation hooks
			const preparedInvitations: Array<{
				invitationData: {
					role: string;
					email: string;
					organizationId: string;
					teamIds: string[];
				} & Record<string, any>;
				originalInvitation: (typeof validInvitations)[0];
			}> = [];

			for (const invitation of validInvitations) {
				const teamIds: string[] =
					"teamId" in invitation
						? typeof invitation.teamId === "string"
							? [invitation.teamId]
							: (invitation.teamId ?? [])
						: [];

				const {
					email: _,
					role: __,
					organizationId: ___,
					resend: ____,
					teamId: _____,
					...additionalFields
				} = invitation;

				const roles = parseRoles(invitation.role);
				let invitationData = {
					role: roles,
					email: invitation.email.toLowerCase(),
					organizationId: organizationId,
					teamIds,
					...(additionalFields ? additionalFields : {}),
				};

				// Run beforeCreateInvitation hook
				if (option?.organizationHooks?.beforeCreateInvitation) {
					const response =
						await option?.organizationHooks.beforeCreateInvitation({
							invitation: {
								...invitationData,
								inviterId: session.user.id,
								teamId: teamIds.length > 0 ? teamIds[0] : undefined,
							},
							inviter: session.user,
							organization,
						});
					if (response && typeof response === "object" && "data" in response) {
						invitationData = {
							...invitationData,
							...response.data,
						};
					}
				}

				preparedInvitations.push({
					invitationData,
					originalInvitation: invitation,
				});
			}

			// Step 2: Create all invitations
			const createdInvitations: InferInvitation<O, false>[] = [];
			for (const { invitationData } of preparedInvitations) {
				try {
					const createdInvitation = await adapter.createInvitation({
						invitation: invitationData,
						user: session.user,
					});
					createdInvitations.push(createdInvitation);
				} catch (error) {
					// If creation fails, add to invalidInvitations
					invalidInvitations.push({
						email: invitationData.email,
						reason:
							error instanceof Error
								? error.message
								: "Failed to create invitation",
					});
				}
			}

			// Step 3: Send all emails in parallel
			await Promise.allSettled(
				createdInvitations.map((createdInvitation) =>
					ctx.context.orgOptions.sendInvitationEmail?.(
						{
							id: createdInvitation.id,
							role: createdInvitation.role,
							email: createdInvitation.email.toLowerCase(),
							organization: organization,
							inviter: {
								...(member as Member),
								user: session.user,
							},
							invitation: createdInvitation,
						},
						ctx.request,
					),
				),
			);

			// Step 4: Run afterCreateInvitation hooks in parallel
			if (option?.organizationHooks?.afterCreateInvitation) {
				await Promise.allSettled(
					createdInvitations.map((createdInvitation) =>
						option.organizationHooks?.afterCreateInvitation?.({
							invitation: createdInvitation as unknown as Invitation,
							inviter: session.user,
							organization: organization,
						}),
					),
				);
			}

			invitationSuccess.push(...createdInvitations);

			return ctx.json({
				success: invitationSuccess,
				failed: invalidInvitations,
				totalProcessed: ctx.body.invitations.length,
				totalSuccessful: invitationSuccess.length,
				totalFailed: invalidInvitations.length,
			});
		},
	);
};

const acceptInvitationBodySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to accept",
	}),
});

export const acceptInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/accept-invitation",
		{
			method: "POST",
			body: acceptInvitationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "Accept an invitation to an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											invitation: {
												type: "object",
											},
											member: {
												type: "object",
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);

			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
				});
			}

			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
				});
			}

			if (
				ctx.context.orgOptions.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION,
				});
			}

			const membershipLimit = ctx.context.orgOptions?.membershipLimit || 100;
			const membersCount = await adapter.countMembers({
				organizationId: invitation.organizationId,
			});

			if (membersCount >= membershipLimit) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED,
				});
			}

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			// Run beforeAcceptInvitation hook
			if (options?.organizationHooks?.beforeAcceptInvitation) {
				await options?.organizationHooks.beforeAcceptInvitation({
					invitation: invitation as unknown as Invitation,
					user: session.user,
					organization,
				});
			}

			const acceptedI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "accepted",
			});
			if (!acceptedI) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.FAILED_TO_RETRIEVE_INVITATION,
				});
			}
			if (
				ctx.context.orgOptions.teams &&
				ctx.context.orgOptions.teams.enabled &&
				"teamId" in acceptedI &&
				acceptedI.teamId
			) {
				const teamIds = (acceptedI.teamId as string).split(",");
				const onlyOne = teamIds.length === 1;

				for (const teamId of teamIds) {
					await adapter.findOrCreateTeamMember({
						teamId: teamId,
						userId: session.user.id,
					});

					if (
						typeof ctx.context.orgOptions.teams.maximumMembersPerTeam !==
						"undefined"
					) {
						const members = await adapter.countTeamMembers({ teamId });

						const maximumMembersPerTeam =
							typeof ctx.context.orgOptions.teams.maximumMembersPerTeam ===
							"function"
								? await ctx.context.orgOptions.teams.maximumMembersPerTeam({
										teamId,
										session: session,
										organizationId: invitation.organizationId,
									})
								: ctx.context.orgOptions.teams.maximumMembersPerTeam;

						if (members >= maximumMembersPerTeam) {
							throw new APIError("FORBIDDEN", {
								message: ORGANIZATION_ERROR_CODES.TEAM_MEMBER_LIMIT_REACHED,
							});
						}
					}
				}

				if (onlyOne) {
					const teamId = teamIds[0]!;
					const updatedSession = await adapter.setActiveTeam(
						session.session.token,
						teamId,
						ctx,
					);

					await setSessionCookie(ctx, {
						session: updatedSession,
						user: session.user,
					});
				}
			}

			const member = await adapter.createMember({
				organizationId: invitation.organizationId,
				userId: session.user.id,
				role: invitation.role,
				createdAt: new Date(),
			});

			await adapter.setActiveOrganization(
				session.session.token,
				invitation.organizationId,
				ctx,
			);
			if (!acceptedI) {
				return ctx.json(null, {
					status: 400,
					body: {
						message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
					},
				});
			}
			if (options?.organizationHooks?.afterAcceptInvitation) {
				await options?.organizationHooks.afterAcceptInvitation({
					invitation: acceptedI as unknown as Invitation,
					member,
					user: session.user,
					organization,
				});
			}
			return ctx.json({
				invitation: acceptedI,
				member,
			});
		},
	);

const rejectInvitationBodySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to reject",
	}),
});

export const rejectInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/reject-invitation",
		{
			method: "POST",
			body: rejectInvitationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			metadata: {
				openapi: {
					description: "Reject an invitation to an organization",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											invitation: {
												type: "object",
											},
											member: {
												type: "object",
												nullable: true,
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter(ctx.context, ctx.context.orgOptions);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);
			if (
				!invitation ||
				invitation.expiresAt < new Date() ||
				invitation.status !== "pending"
			) {
				throw new APIError("BAD_REQUEST", {
					message: "Invitation not found!",
				});
			}
			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
				});
			}

			if (
				ctx.context.orgOptions.requireEmailVerificationOnInvitation &&
				!session.user.emailVerified
			) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION,
				});
			}

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			// Run beforeRejectInvitation hook
			if (options?.organizationHooks?.beforeRejectInvitation) {
				await options?.organizationHooks.beforeRejectInvitation({
					invitation: invitation as unknown as Invitation,
					user: session.user,
					organization,
				});
			}

			const rejectedI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "rejected",
			});

			// Run afterRejectInvitation hook
			if (options?.organizationHooks?.afterRejectInvitation) {
				await options?.organizationHooks.afterRejectInvitation({
					invitation: rejectedI || (invitation as unknown as Invitation),
					user: session.user,
					organization,
				});
			}

			return ctx.json({
				invitation: rejectedI,
				member: null,
			});
		},
	);

const cancelInvitationBodySchema = z.object({
	invitationId: z.string().meta({
		description: "The ID of the invitation to cancel",
	}),
});

export const cancelInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/cancel-invitation",
		{
			method: "POST",
			body: cancelInvitationBodySchema,
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			openapi: {
				operationId: "cancelOrganizationInvitation",
				description: "Cancel an invitation to an organization",
				responses: {
					"200": {
						description: "Success",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										invitation: {
											type: "object",
										},
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const session = ctx.context.session;
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitation = await adapter.findInvitationById(
				ctx.body.invitationId,
			);
			if (!invitation) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND,
				});
			}
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: invitation.organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				});
			}
			const canCancel = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						invitation: ["cancel"],
					},
					organizationId: invitation.organizationId,
				},
				ctx,
			);

			if (!canCancel) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION,
				});
			}

			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}

			// Run beforeCancelInvitation hook
			if (options?.organizationHooks?.beforeCancelInvitation) {
				await options?.organizationHooks.beforeCancelInvitation({
					invitation: invitation as unknown as Invitation,
					cancelledBy: session.user,
					organization,
				});
			}

			const canceledI = await adapter.updateInvitation({
				invitationId: ctx.body.invitationId,
				status: "canceled",
			});

			// Run afterCancelInvitation hook
			if (options?.organizationHooks?.afterCancelInvitation) {
				await options?.organizationHooks.afterCancelInvitation({
					invitation: (canceledI as unknown as Invitation) || invitation,
					cancelledBy: session.user,
					organization,
				});
			}

			return ctx.json(canceledI);
		},
	);

const getInvitationQuerySchema = z.object({
	id: z.string().meta({
		description: "The ID of the invitation to get",
	}),
});

export const getInvitation = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/get-invitation",
		{
			method: "GET",
			use: [orgMiddleware],
			requireHeaders: true,
			query: getInvitationQuerySchema,
			metadata: {
				openapi: {
					description: "Get an invitation by ID",
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
											organizationName: {
												type: "string",
											},
											organizationSlug: {
												type: "string",
											},
											inviterEmail: {
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
											"organizationName",
											"organizationSlug",
											"inviterEmail",
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
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Not authenticated",
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const invitation = await adapter.findInvitationById(ctx.query.id);
			if (
				!invitation ||
				invitation.status !== "pending" ||
				invitation.expiresAt < new Date()
			) {
				throw new APIError("BAD_REQUEST", {
					message: "Invitation not found!",
				});
			}
			if (invitation.email.toLowerCase() !== session.user.email.toLowerCase()) {
				throw new APIError("FORBIDDEN", {
					message:
						ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION,
				});
			}
			const organization = await adapter.findOrganizationById(
				invitation.organizationId,
			);
			if (!organization) {
				throw new APIError("BAD_REQUEST", {
					message: ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				});
			}
			const member = await adapter.findMemberByOrgId({
				userId: invitation.inviterId,
				organizationId: invitation.organizationId,
			});
			if (!member) {
				throw new APIError("BAD_REQUEST", {
					message:
						ORGANIZATION_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION,
				});
			}

			return ctx.json({
				...invitation,
				organizationName: organization.name,
				organizationSlug: organization.slug,
				inviterEmail: member.user.email,
			});
		},
	);

const listInvitationQuerySchema = z
	.object({
		organizationId: z
			.string()
			.meta({
				description: "The ID of the organization to list invitations for",
			})
			.optional(),
	})
	.optional();

export const listInvitations = <O extends OrganizationOptions>(options: O) =>
	createAuthEndpoint(
		"/organization/list-invitations",
		{
			method: "GET",
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			query: listInvitationQuerySchema,
		},
		async (ctx) => {
			const session = await getSessionFromCtx(ctx);
			if (!session) {
				throw new APIError("UNAUTHORIZED", {
					message: "Not authenticated",
				});
			}
			const orgId =
				ctx.query?.organizationId || session.session.activeOrganizationId;
			if (!orgId) {
				throw new APIError("BAD_REQUEST", {
					message: "Organization ID is required",
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);
			const isMember = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: orgId,
			});
			if (!isMember) {
				throw new APIError("FORBIDDEN", {
					message: "You are not a member of this organization",
				});
			}
			const invitations = await adapter.listInvitations({
				organizationId: orgId,
			});
			return ctx.json(invitations);
		},
	);

/**
 * List all invitations a user has received
 */
export const listUserInvitations = <O extends OrganizationOptions>(
	options: O,
) =>
	createAuthEndpoint(
		"/organization/list-user-invitations",
		{
			method: "GET",
			use: [orgMiddleware],
			query: z
				.object({
					email: z
						.string()
						.meta({
							description:
								"The email of the user to list invitations for. This only works for server side API calls.",
						})
						.optional(),
				})
				.optional(),
			metadata: {
				openapi: {
					description: "List all invitations a user has received",
					responses: {
						"200": {
							description: "Success",
							content: {
								"application/json": {
									schema: {
										type: "array",
										items: {
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
												organizationName: {
													type: "string",
												},
												inviterId: {
													type: "string",
													description:
														"The ID of the user who created the invitation",
												},
												teamId: {
													type: "string",
													description:
														"The ID of the team associated with the invitation",
													nullable: true,
												},
												status: {
													type: "string",
												},
												expiresAt: {
													type: "string",
												},
												createdAt: {
													type: "string",
												},
											},
											required: [
												"id",
												"email",
												"role",
												"organizationId",
												"organizationName",
												"inviterId",
												"status",
												"expiresAt",
												"createdAt",
											],
										},
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

			if (ctx.request && ctx.query?.email) {
				throw new APIError("BAD_REQUEST", {
					message: "User email cannot be passed for client side API calls.",
				});
			}

			const userEmail = session?.user.email || ctx.query?.email;
			if (!userEmail) {
				throw new APIError("BAD_REQUEST", {
					message: "Missing session headers, or email query parameter.",
				});
			}
			const adapter = getOrgAdapter<O>(ctx.context, options);

			const invitations = await adapter.listUserInvitations(userEmail);
			return ctx.json(invitations);
		},
	);
