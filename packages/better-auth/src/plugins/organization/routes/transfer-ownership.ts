import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { appendQueryParams } from "@better-auth/core/utils/url";
import * as z from "zod";
import { getSessionFromCtx, isStateful, originCheck } from "../../../api";
import { generateRandomString } from "../../../crypto";
import type { User } from "../../../types";
import { getOrgAdapter } from "../adapter";
import { orgMiddleware } from "../call";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { hasPermission } from "../has-permission";
import type { InferOrganization, Member } from "../schema";
import type { OrganizationOptions } from "../types";

/**
 * Re-validates a pending ownership-transfer token: session, the current
 * owner's membership, and the `member:update` permission (or creator
 * shortcut) are all rechecked here because they may have changed since the
 * confirmation email was sent. The target member is also rechecked so a
 * membership change after the email was sent (e.g. the target left, or was
 * promoted by another route) can't be replayed against a stale target.
 * `consume: true` burns the single-use token; `consume: false` only peeks it.
 */
async function resolveTransferOwnershipToken<O extends OrganizationOptions>(
	ctx: GenericEndpointContext,
	options: O,
	token: string,
	{ consume }: { consume: boolean },
) {
	const identifier = `transfer-ownership-${token}`;
	const verification = consume
		? await ctx.context.internalAdapter.consumeVerificationValue(identifier)
		: await ctx.context.internalAdapter.findVerificationValue(identifier);
	if (!verification || (!consume && verification.expiresAt < new Date())) {
		throw APIError.from("NOT_FOUND", ORGANIZATION_ERROR_CODES.INVALID_TOKEN);
	}
	const [organizationId, currentOwnerMemberId, newOwnerMemberId] =
		verification.value.split(":");
	if (!organizationId || !currentOwnerMemberId || !newOwnerMemberId) {
		throw APIError.from("NOT_FOUND", ORGANIZATION_ERROR_CODES.INVALID_TOKEN);
	}
	// Ownership transfer is sensitive: bypass the cookie cache on stateful
	// deployments so a revoked-but-cached session cannot complete it even
	// when paired with a valid transfer-ownership token.
	const session = await getSessionFromCtx(ctx, {
		disableCookieCache: isStateful(ctx),
	});
	if (!session) {
		throw APIError.from("NOT_FOUND", BASE_ERROR_CODES.FAILED_TO_GET_USER_INFO);
	}
	const adapter = getOrgAdapter<O>(ctx.context, options);
	const currentOwner = await adapter.findMemberById(currentOwnerMemberId);
	if (
		!currentOwner ||
		currentOwner.organizationId !== organizationId ||
		currentOwner.userId !== session.user.id
	) {
		throw APIError.from("NOT_FOUND", ORGANIZATION_ERROR_CODES.INVALID_TOKEN);
	}
	const creatorRole = options.creatorRole || "owner";
	const canTransfer = await hasPermission(
		{
			role: currentOwner.role,
			permissions: { member: ["update"] },
			organizationId,
			options,
			allowCreatorAllPermissions: true,
		},
		ctx,
	);
	if (!canTransfer) {
		throw APIError.from(
			"FORBIDDEN",
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_TRANSFER_OWNERSHIP_OF_THIS_ORGANIZATION,
		);
	}
	const newOwnerMember = await adapter.findMemberById(newOwnerMemberId);
	if (!newOwnerMember || newOwnerMember.organizationId !== organizationId) {
		throw APIError.from(
			"BAD_REQUEST",
			ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
		);
	}
	if (newOwnerMember.role.split(",").includes(creatorRole)) {
		throw APIError.from(
			"BAD_REQUEST",
			ORGANIZATION_ERROR_CODES.TARGET_MEMBER_IS_ALREADY_THE_OWNER,
		);
	}
	const organization = await adapter.findOrganizationById(organizationId);
	if (!organization) {
		throw APIError.from(
			"BAD_REQUEST",
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
		);
	}
	const [currentOwnerUser, newOwnerUser] = await Promise.all([
		ctx.context.internalAdapter.findUserById(currentOwner.userId),
		ctx.context.internalAdapter.findUserById(newOwnerMember.userId),
	]);
	if (!currentOwnerUser || !newOwnerUser) {
		throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
	}
	return {
		organizationId,
		organization,
		creatorRole,
		currentOwner: { ...currentOwner, user: currentOwnerUser },
		newOwner: { ...newOwnerMember, user: newOwnerUser },
	};
}

/**
 * Runs the actual ownership swap: fires the before/after hooks around the
 * atomic promote/demote in the adapter. Shared by the immediate path (no
 * confirmation configured), the instant callback, and the explicit-mode
 * confirm endpoint so all three apply exactly the same mutation.
 */
async function performTransferOwnership<O extends OrganizationOptions>(
	ctx: GenericEndpointContext,
	options: O,
	organizationId: string,
	creatorRole: string,
	currentOwner: Member & { user: User },
	newOwner: Member & { user: User },
	organization: InferOrganization<O>,
) {
	const adapter = getOrgAdapter<O>(ctx.context, options);
	if (options?.organizationHooks?.beforeTransferOwnership) {
		await options.organizationHooks.beforeTransferOwnership(
			{ organization, currentOwner, newOwner },
			ctx,
		);
	}
	const { newOwner: updatedNewOwner, previousOwner: updatedPreviousOwner } =
		await adapter.transferOwnership({
			currentOwnerMemberId: currentOwner.id,
			newOwnerMemberId: newOwner.id,
			creatorRole,
		});
	if (options?.organizationHooks?.afterTransferOwnership) {
		await options.organizationHooks.afterTransferOwnership(
			{
				organization,
				previousOwner: updatedPreviousOwner,
				newOwner: updatedNewOwner,
			},
			ctx,
		);
	}
	return { newOwner: updatedNewOwner, previousOwner: updatedPreviousOwner };
}

const transferOwnershipBodySchema = z.object({
	/**
	 * If not provided, you must provide session headers to get the active
	 * organization.
	 */
	organizationId: z
		.string()
		.meta({
			description:
				'The organization id the transfer applies to. If not provided, the active organization from the session is used. Eg: "organization-id"',
		})
		.optional(),
	newOwnerMemberId: z.string().meta({
		description: 'The member id to transfer ownership to. Eg: "member-id"',
	}),
	/**
	 * The callback URL to redirect to after ownership is transferred. Only
	 * used when a transfer confirmation email is sent.
	 */
	callbackURL: z
		.string()
		.meta({
			description:
				"The callback URL to redirect to after ownership is transferred",
		})
		.optional(),
	/**
	 * The token to confirm a pending transfer. If provided, ownership is
	 * transferred immediately and the other fields are ignored.
	 */
	token: z
		.string()
		.meta({
			description: "The token to confirm the ownership transfer request",
		})
		.optional(),
});

export const transferOwnership = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/transfer-ownership",
		{
			method: "POST",
			body: transferOwnershipBodySchema,
			requireHeaders: true,
			use: [orgMiddleware],
			metadata: {
				openapi: {
					description:
						"Transfer ownership of an organization to another member",
					responses: {
						"200": {
							description:
								"Ownership transfer processed successfully: either the updated members, or a pending-verification acknowledgement when a transfer confirmation email is configured",
						},
					},
				},
			},
		},
		async (ctx) => {
			if (ctx.body.token) {
				const {
					organizationId,
					organization,
					creatorRole,
					currentOwner,
					newOwner,
				} = await resolveTransferOwnershipToken(ctx, options, ctx.body.token, {
					consume: true,
				});
				const result = await performTransferOwnership(
					ctx,
					options,
					organizationId,
					creatorRole,
					currentOwner,
					newOwner,
					organization,
				);
				return ctx.json(result);
			}

			const session = await ctx.context.getSession(ctx);
			if (!session) {
				throw APIError.fromStatus("UNAUTHORIZED");
			}

			const organizationId =
				ctx.body.organizationId || session.session.activeOrganizationId;
			if (!organizationId) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION,
				);
			}

			const adapter = getOrgAdapter<O>(ctx.context, options);
			const currentOwner = await adapter.findMemberByOrgId({
				userId: session.user.id,
				organizationId,
			});
			if (!currentOwner) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				);
			}

			const canTransfer = await hasPermission(
				{
					role: currentOwner.role,
					permissions: { member: ["update"] },
					organizationId,
					options: ctx.context.orgOptions,
					allowCreatorAllPermissions: true,
				},
				ctx,
			);
			if (!canTransfer) {
				throw APIError.from(
					"FORBIDDEN",
					ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_TRANSFER_OWNERSHIP_OF_THIS_ORGANIZATION,
				);
			}

			const newOwnerMember = await adapter.findMemberById(
				ctx.body.newOwnerMemberId,
			);
			if (!newOwnerMember || newOwnerMember.organizationId !== organizationId) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND,
				);
			}
			if (newOwnerMember.id === currentOwner.id) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.YOU_CANNOT_TRANSFER_OWNERSHIP_TO_YOURSELF,
				);
			}
			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";
			if (newOwnerMember.role.split(",").includes(creatorRole)) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.TARGET_MEMBER_IS_ALREADY_THE_OWNER,
				);
			}

			const organization = await adapter.findOrganizationById(organizationId);
			if (!organization) {
				throw APIError.from(
					"BAD_REQUEST",
					ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND,
				);
			}

			if (options?.ownershipTransfer?.sendTransferOwnershipVerification) {
				const [currentOwnerUser, newOwnerUser] = await Promise.all([
					ctx.context.internalAdapter.findUserById(currentOwner.userId),
					ctx.context.internalAdapter.findUserById(newOwnerMember.userId),
				]);
				if (!currentOwnerUser || !newOwnerUser) {
					throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
				}
				const token = generateRandomString(32, "0-9", "a-z");
				await ctx.context.internalAdapter.createVerificationValue({
					value: `${organizationId}:${currentOwner.id}:${newOwnerMember.id}`,
					identifier: `transfer-ownership-${token}`,
					expiresAt: new Date(
						Date.now() +
							(options.ownershipTransfer?.transferTokenExpiresIn ||
								60 * 60 * 24) *
								1000,
					),
				});
				const confirmationMode =
					options.ownershipTransfer?.confirmationMode || "instant";
				const url =
					confirmationMode === "explicit"
						? appendQueryParams(
								ctx.body.callbackURL || "/",
								new URLSearchParams({ token }),
							)
						: `${
								ctx.context.baseURL
							}/organization/transfer-ownership/callback?token=${token}&callbackURL=${encodeURIComponent(
								ctx.body.callbackURL || "/",
							)}`;
				await ctx.context.runInBackgroundOrAwait(
					options.ownershipTransfer.sendTransferOwnershipVerification(
						{
							organization,
							currentOwner: { ...currentOwner, user: currentOwnerUser },
							newOwner: { ...newOwnerMember, user: newOwnerUser },
							url,
							token,
						},
						ctx.request,
					),
				);
				return ctx.json({
					success: true,
					message: "Verification email sent",
				});
			}

			const currentOwnerUser = await ctx.context.internalAdapter.findUserById(
				currentOwner.userId,
			);
			const newOwnerUser = await ctx.context.internalAdapter.findUserById(
				newOwnerMember.userId,
			);
			if (!currentOwnerUser || !newOwnerUser) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.USER_NOT_FOUND);
			}
			const result = await performTransferOwnership(
				ctx,
				options,
				organizationId,
				creatorRole,
				{ ...currentOwner, user: currentOwnerUser },
				{ ...newOwnerMember, user: newOwnerUser },
				organization,
			);
			return ctx.json(result);
		},
	);
};

export const transferOwnershipCallback = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/transfer-ownership/callback",
		{
			method: "GET",
			query: z.object({
				token: z.string().meta({
					description: "The token to verify the ownership transfer request",
				}),
				callbackURL: z
					.string()
					.meta({
						description: "The URL to redirect to after the transfer",
					})
					.optional(),
			}),
			use: [originCheck((ctx) => ctx.query.callbackURL)],
			metadata: {
				openapi: {
					description:
						"Callback to complete an ownership transfer with a verification token",
					responses: {
						"200": {
							description: "Ownership successfully transferred",
						},
					},
				},
			},
		},
		async (ctx) => {
			const {
				organizationId,
				organization,
				creatorRole,
				currentOwner,
				newOwner,
			} = await resolveTransferOwnershipToken(ctx, options, ctx.query.token, {
				consume: true,
			});
			const result = await performTransferOwnership(
				ctx,
				options,
				organizationId,
				creatorRole,
				currentOwner,
				newOwner,
				organization,
			);
			if (ctx.query.callbackURL) {
				throw ctx.redirect(ctx.query.callbackURL);
			}
			return ctx.json(result);
		},
	);
};

export const transferOwnershipPreview = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/transfer-ownership/preview",
		{
			method: "GET",
			query: z.object({
				token: z.string().meta({
					description: "The token to preview the ownership transfer request",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Preview a pending ownership transfer without applying it. Used by explicit confirmation mode.",
					responses: {
						"200": {
							description: "The pending ownership transfer",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { organization, currentOwner, newOwner } =
				await resolveTransferOwnershipToken(ctx, options, ctx.query.token, {
					consume: false,
				});
			return ctx.json({ organization, currentOwner, newOwner });
		},
	);
};

export const transferOwnershipConfirm = <O extends OrganizationOptions>(
	options: O,
) => {
	return createAuthEndpoint(
		"/organization/transfer-ownership/confirm",
		{
			method: "POST",
			body: z.object({
				token: z.string().meta({
					description: "The token to confirm the ownership transfer request",
				}),
			}),
			metadata: {
				openapi: {
					description:
						"Confirm and apply a pending ownership transfer. Used by explicit confirmation mode.",
					responses: {
						"200": {
							description: "Ownership successfully transferred",
						},
					},
				},
			},
		},
		async (ctx) => {
			const {
				organizationId,
				organization,
				creatorRole,
				currentOwner,
				newOwner,
			} = await resolveTransferOwnershipToken(ctx, options, ctx.body.token, {
				consume: true,
			});
			const result = await performTransferOwnership(
				ctx,
				options,
				organizationId,
				creatorRole,
				currentOwner,
				newOwner,
				organization,
			);
			return ctx.json(result);
		},
	);
};
