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
import type { InferOrganization, Member } from "../schema";
import type { OrganizationOptions } from "../types";

const transferOwnershipTokenValueSchema = z.object({
	organizationId: z.string(),
	currentOwnerMemberId: z.string(),
	newOwnerMemberId: z.string(),
});

function parseTransferOwnershipTokenValue(raw: string) {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	const result = transferOwnershipTokenValueSchema.safeParse(parsed);
	return result.success ? result.data : null;
}

/**
 * Ownership transfer only ever moves `creatorRole` off of someone who
 * currently holds it, onto someone who doesn't -- the same invariant
 * `update-member-role` enforces when a role change targets the creator
 * role (only an existing creator may grant or take it), rather than the
 * generic `member:update` permission a plain admin also holds. Checking
 * `member:update` here instead (as an earlier version of this endpoint
 * did) would let any admin nominate a new owner while leaving the actual
 * owner untouched, minting an extra owner nobody with real authority
 * approved.
 */
function isCreator(role: string, creatorRole: string) {
	return role
		.split(",")
		.map((r) => r.trim())
		.includes(creatorRole);
}

/**
 * Re-validates a pending ownership-transfer token *without consuming it*:
 * session, the current owner's role, and the target's eligibility are all
 * checked here because they may have changed since the confirmation email
 * was sent. Used by all three endpoints. The callback and confirm endpoints
 * additionally call `consumeTransferOwnershipToken` immediately before
 * applying the swap -- burning the token here instead would let an
 * unauthenticated or unauthorized visit (an email scanner following the
 * link with no session, for instance) permanently invalidate it before the
 * real owner ever gets a chance to use it.
 */
async function resolveTransferOwnershipToken<O extends OrganizationOptions>(
	ctx: GenericEndpointContext,
	options: O,
	token: string,
) {
	const identifier = `transfer-ownership-${token}`;
	const verification =
		await ctx.context.internalAdapter.findVerificationValue(identifier);
	if (!verification || verification.expiresAt < new Date()) {
		throw APIError.from("NOT_FOUND", ORGANIZATION_ERROR_CODES.INVALID_TOKEN);
	}
	const tokenValue = parseTransferOwnershipTokenValue(verification.value);
	if (!tokenValue) {
		throw APIError.from("NOT_FOUND", ORGANIZATION_ERROR_CODES.INVALID_TOKEN);
	}
	const { organizationId, currentOwnerMemberId, newOwnerMemberId } = tokenValue;
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
	// Re-check the caller still holds creatorRole now, not just at the time
	// the email was sent: it may have been reassigned since.
	if (!isCreator(currentOwner.role, creatorRole)) {
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
	if (isCreator(newOwnerMember.role, creatorRole)) {
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
 * Atomically consumes the transfer-ownership token, once every check in
 * `resolveTransferOwnershipToken` has already passed. This is the only
 * point that burns the single-use token, so two concurrent callbacks with
 * the same token can still complete the swap at most once, while an
 * unauthorized peek never destroys it. Re-validates the consumed row still
 * matches what was already checked, in case it changed in the gap between
 * the two calls.
 */
async function consumeTransferOwnershipToken(
	ctx: GenericEndpointContext,
	token: string,
	expected: {
		organizationId: string;
		currentOwnerMemberId: string;
		newOwnerMemberId: string;
	},
) {
	const identifier = `transfer-ownership-${token}`;
	const verification =
		await ctx.context.internalAdapter.consumeVerificationValue(identifier);
	const tokenValue = verification
		? parseTransferOwnershipTokenValue(verification.value)
		: null;
	if (
		!tokenValue ||
		tokenValue.organizationId !== expected.organizationId ||
		tokenValue.currentOwnerMemberId !== expected.currentOwnerMemberId ||
		tokenValue.newOwnerMemberId !== expected.newOwnerMemberId
	) {
		throw APIError.from("NOT_FOUND", ORGANIZATION_ERROR_CODES.INVALID_TOKEN);
	}
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

			const creatorRole = ctx.context.orgOptions?.creatorRole || "owner";
			// Only a current owner may give up or reassign the creator role --
			// the generic member:update permission (which a plain admin also
			// holds) is not enough, same as update-member-role's own rule for
			// touching the creator role.
			if (!isCreator(currentOwner.role, creatorRole)) {
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
			if (isCreator(newOwnerMember.role, creatorRole)) {
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
					value: JSON.stringify({
						organizationId,
						currentOwnerMemberId: currentOwner.id,
						newOwnerMemberId: newOwnerMember.id,
					} satisfies z.infer<typeof transferOwnershipTokenValueSchema>),
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
			} = await resolveTransferOwnershipToken(ctx, options, ctx.query.token);
			await consumeTransferOwnershipToken(ctx, ctx.query.token, {
				organizationId,
				currentOwnerMemberId: currentOwner.id,
				newOwnerMemberId: newOwner.id,
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
				await resolveTransferOwnershipToken(ctx, options, ctx.query.token);
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
			} = await resolveTransferOwnershipToken(ctx, options, ctx.body.token);
			await consumeTransferOwnershipToken(ctx, ctx.body.token, {
				organizationId,
				currentOwnerMemberId: currentOwner.id,
				newOwnerMemberId: newOwner.id,
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
