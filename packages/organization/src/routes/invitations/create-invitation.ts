import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { InferAdditionalFieldsFromPluginOptions } from "better-auth/db";
import * as z from "zod/v4";
import type { InferOrganizationRolesFromOption } from "../../access";
import { hasPermission, parseRoles } from "../../access";
import type { TeamsAddon } from "../../addons";
import { buildEndpointSchema } from "../../helpers/build-endpoint-schema";
import { getDate } from "../../helpers/date";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { getAddon } from "../../helpers/get-addon";
import { getHook } from "../../helpers/get-hook";
import type { RealOrganizationId } from "../../helpers/get-org-adapter";
import { getOrgAdapter } from "../../helpers/get-org-adapter";
import { getOrganizationId } from "../../helpers/get-organization-id";
import { resolveOrgOptions } from "../../helpers/resolve-org-options";
import { orgMiddleware, orgSessionMiddleware } from "../../middleware";
import type {
	InferInvitation,
	InferOrganization,
	OrganizationOptions,
} from "../../types";

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

export type CreateInvitation<O extends OrganizationOptions> = ReturnType<
	typeof createInvitation<O>
>;

export const createInvitation = <O extends OrganizationOptions>(
	_options: O,
) => {
	const options = resolveOrgOptions(_options);

	const { schema } = buildEndpointSchema({
		baseSchema: baseInvitationSchema,
		additionalFieldsSchema: options?.schema as O["schema"],
		additionalFieldsModel: "invitation",
	});

	return createAuthEndpoint(
		"/organization/invite-member",
		{
			method: "POST",
			requireHeaders: true,
			use: [orgMiddleware, orgSessionMiddleware],
			body: schema,
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
						/**
						 * The team ID to invite the user to
						 */
						teamId?: string | string[] | undefined;
					} & InferAdditionalFieldsFromPluginOptions<"invitation", O, false>,
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
			const organization = await getOrganizationId<
				InferOrganization<O, false>,
				true
			>({ ctx, shouldGetOrganization: true });
			const organizationId = organization.id as RealOrganizationId;

			const email = ctx.body.email.toLowerCase();
			const isValidEmail = z.email().safeParse(email);
			if (!isValidEmail.success) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
			}

			const adapter = getOrgAdapter(ctx.context, _options);
			const member = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId: organizationId,
			});
			if (!member) {
				const msg = ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND;
				throw APIError.from("BAD_REQUEST", msg);
			}
			const canInvite = await hasPermission(
				{
					role: member.role,
					options: ctx.context.orgOptions,
					permissions: {
						invitation: ["create"],
					},
					organizationId: organizationId,
				},
				ctx,
			);

			if (!canInvite) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const creatorRole = ctx.context.orgOptions.creatorRole || "owner";
			const roles = parseRoles(ctx.body.role);

			// TODO: Dynamic access control is not implemented yet
			// const rolesArray = roles
			// 	.split(",")
			// 	.map((r) => r.trim())
			// 	.filter(Boolean);
			// const defaults = Object.keys(defaultRoles);
			// const customRoles = Object.keys(ctx.context.orgOptions.roles || {});
			// const validStaticRoles = new Set([...defaults, ...customRoles]);
			// const unknownRoles = rolesArray.filter(
			// 	(role) => !validStaticRoles.has(role),
			// );
			// if (unknownRoles.length > 0) {
			// 	if (ctx.context.orgOptions.dynamicAccessControl?.enabled) {
			// 		const foundRoles = await ctx.context.adapter.findMany({
			// 			model: "organizationRole",
			// 			where: [
			// 				{ field: "organizationId", value: organizationId },
			// 				{ field: "role", value: unknownRoles, operator: "in" },
			// 			],
			// 		});
			// 		const foundRoleNames = foundRoles.map((r: any) => r.role);
			// 		const stillInvalid = unknownRoles.filter(
			// 			(r) => !foundRoleNames.includes(r),
			// 		);

			// 		if (stillInvalid.length > 0) {
			// 			throw new APIError("BAD_REQUEST", {
			// 				message: `${ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND}: ${stillInvalid.join(", ")}`,
			// 			});
			// 		}
			// 	} else {
			// 		throw new APIError("BAD_REQUEST", {
			// 			message: `${ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND}: ${unknownRoles.join(", ")}`,
			// 		});
			// 	}
			// }

			if (
				member.role !== creatorRole &&
				roles.split(",").includes(creatorRole)
			) {
				const code = "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			const alreadyMember = await adapter.findMemberByEmail({
				email: email,
				organizationId: organizationId,
			});
			if (alreadyMember) {
				const code = "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}
			const alreadyInvited = await adapter.findPendingInvitation({
				email: email,
				organizationId: organizationId,
			});
			if (alreadyInvited.length && !ctx.body.resend) {
				const code = "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("BAD_REQUEST", msg);
			}

			// If resend is true and cancelPendingInvitationsOnReInvite is enabled,
			// cancel the old invitation and create a new one
			if (
				alreadyInvited.length &&
				ctx.body.resend &&
				options.cancelPendingInvitationsOnReInvite
			) {
				const invitation = alreadyInvited[0]!;
				await adapter.updateInvitation({
					invitationId: invitation.id,
					status: "canceled",
				});
				// Fall through to create a new invitation
			}
			// If resend is true but cancelPendingInvitationsOnReInvite is false,
			// just update the existing invitation's expiration and return
			else if (alreadyInvited.length && ctx.body.resend) {
				const existingInvitation = alreadyInvited[0]!;

				// Update the invitation's expiration date using the same logic as createInvitation
				const newExpiresAt = getDate(options.invitationExpiresIn, "sec");

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
				} as InferInvitation<O, false>;

				await ctx.context.runInBackgroundOrAwait(
					options.sendInvitationEmail(
						{
							id: updatedInvitation.id!,
							role: updatedInvitation.role! as string,
							email: updatedInvitation.email!.toLowerCase(),
							organization: organization,
							inviter: {
								...member,
								user: session.user,
							},
							invitation: updatedInvitation,
						},
						ctx,
					),
				);

				return ctx.json({ invitation: updatedInvitation, organization });
			}

			const invitationLimit = await options.invitationLimit(
				{ member, organization, user: session.user },
				ctx,
			);

			const pendingInvitations = await adapter.findPendingInvitations({
				organizationId,
			});

			if (pendingInvitations.length >= invitationLimit) {
				const code = "INVITATION_LIMIT_REACHED";
				const msg = ORGANIZATION_ERROR_CODES[code];
				throw APIError.from("FORBIDDEN", msg);
			}

			// Team support: validate teams exist and check member limits
			const [teamsAddon] = getAddon(options, "teams", {} as TeamsAddon);
			let teamIds: string[] = [];

			if ("teamId" in ctx.body && ctx.body.teamId) {
				teamIds =
					typeof ctx.body.teamId === "string"
						? [ctx.body.teamId as string]
						: ((ctx.body.teamId as string[]) ?? []);
			}

			if (teamsAddon && teamIds.length > 0) {
				await teamsAddon.events.validateInvitationTeams(
					{
						teamIds,
						organizationId,
						session,
					},
					ctx.context,
				);
			}

			const {
				email: _,
				role: __,
				organizationId: ___,
				resend: ____,
				teamId: _____,
				...additionalFields
			} = ctx.body as typeof ctx.body & { teamId?: string | string[] };

			let invitationData = {
				role: roles,
				email: email,
				organizationId: organizationId,
				teamIds,
				...(additionalFields ? additionalFields : {}),
			};

			const invitationHooks = getHook("CreateInvitation", options);
			const mutatedInvitationData = await invitationHooks.before(
				{
					invitation: {
						...invitationData,
						inviterId: session.user.id,
						teamId: teamIds.length > 0 ? teamIds.join(",") : undefined,
					},
					inviter: { ...member, user: session.user },
					organization,
				},
				ctx,
			);

			if (mutatedInvitationData) {
				invitationData = {
					...invitationData,
					...mutatedInvitationData,
				};
			}

			const invitation = await adapter.createInvitation({
				invitation: {
					...invitationData,
					teamIds,
				},
				user: session.user,
			});

			await ctx.context.runInBackgroundOrAwait(
				options.sendInvitationEmail(
					{
						id: invitation.id,
						role: invitation.role,
						email: invitation.email.toLowerCase(),
						organization: organization,
						inviter: {
							...member,
							user: session.user,
						},
						invitation,
					},
					ctx,
				),
			);

			await invitationHooks.after(
				{
					invitation,
					inviter: {
						...member,
						user: session.user,
					},
					organization,
				},
				ctx,
			);

			return ctx.json({ invitation, organization });
		},
	);
};
