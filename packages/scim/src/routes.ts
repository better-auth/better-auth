import { base64Url } from "@better-auth/utils/base64";
import type {
	Account,
	DBAdapter,
	GenericEndpointContext,
	User,
} from "better-auth";
import { HIDE_METADATA } from "better-auth";
import {
	APIError,
	createAuthEndpoint,
	sessionMiddleware,
} from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import type { Member } from "better-auth/plugins";
import { getOrgAdapter } from "better-auth/plugins";
import * as z from "zod";
import {
	applySCIMGroupPatch,
	createSCIMGroupResource,
	deleteSCIMGroupResource,
	findSCIMGroupResource,
	listSCIMGroupReferencesByUser,
	listSCIMGroupResources,
	listUserSCIMGroupReferences,
	removeUserFromSCIMGroups,
	replaceSCIMGroupResource,
} from "./group-provisioning";
import {
	APIGroupSchema,
	OpenAPIGroupResourceSchema,
	SCIMGroupResourceSchema,
	SCIMGroupResourceType,
} from "./group-schemas";
import {
	getAccountId,
	getUserFullName,
	getUserPrimaryEmail,
	scimAccountProviderId,
} from "./mappings";
import type { AuthMiddleware } from "./middlewares";
import { buildUserPatch } from "./patch-operations";
import { SCIMAPIError, SCIMErrorOpenAPISchemas } from "./scim-error";
import type { SCIMFilterWhere } from "./scim-filters";
import { parseSCIMUserFilter, SCIMParseError } from "./scim-filters";
import {
	ResourceTypeOpenAPISchema,
	SCIMSchemaOpenAPISchema,
	ServiceProviderOpenAPISchema,
} from "./scim-metadata";
import { createGroupResource, createUserResource } from "./scim-resources";
import { storeSCIMToken } from "./scim-tokens";
import type { SCIMOptions, SCIMProvider } from "./types";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIMUserResourceSchema,
	SCIMUserResourceType,
} from "./user-schemas";
import { getResourceURL } from "./utils";

const supportedSCIMSchemas = [SCIMUserResourceSchema, SCIMGroupResourceSchema];
const supportedSCIMResourceTypes = [
	SCIMUserResourceType,
	SCIMGroupResourceType,
];
const supportedMediaTypes = ["application/json", "application/scim+json"];

const generateSCIMTokenBodySchema = z.object({
	providerId: z.string().meta({ description: "Provider identifier" }),
	organizationId: z
		.string()
		.meta({ description: "Organization the token is scoped to" }),
});

const getSCIMProviderConnectionQuerySchema = z.object({
	providerId: z.string(),
	organizationId: z.string(),
});

const deleteSCIMProviderConnectionBodySchema = z.object({
	providerId: z.string(),
	organizationId: z.string(),
});

function parseMemberRoles(role: string): string[] {
	return role
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function hasRequiredRole(memberRole: string, requiredRole: string[]): boolean {
	return (
		!requiredRole.length ||
		parseMemberRoles(memberRole).some((role) => requiredRole.includes(role))
	);
}

function defaultOrgRoles(ctx: GenericEndpointContext): string[] {
	const creatorRole =
		ctx.context.getPlugin("organization")?.options?.creatorRole;

	return Array.from(new Set(["admin", creatorRole ?? "owner"]));
}

async function isOrgActionAllowed(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	payload: { user: User; member: Member | null; organizationId: string },
): Promise<boolean> {
	if (!payload.member) return false;
	if (typeof opts.requiredRole === "function") {
		return !!(await opts.requiredRole({
			user: payload.user,
			member: payload.member,
			organizationId: payload.organizationId,
			ctx,
		}));
	}
	const roles = opts.requiredRole ?? defaultOrgRoles(ctx);
	return hasRequiredRole(payload.member.role, roles);
}

/** Authorizes organization-scoped SCIM management actions. */
async function assertOrgAccess(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	user: User,
	organizationId: string,
): Promise<Member> {
	if (!ctx.context.hasPlugin("organization")) {
		throw new APIError("FORBIDDEN", {
			message: "Organization plugin is required to access this SCIM provider",
		});
	}
	const member = await findOrganizationMember(ctx, user.id, organizationId);
	const allowed = await isOrgActionAllowed(ctx, opts, {
		user,
		member,
		organizationId,
	});
	if (!allowed) {
		throw new APIError("FORBIDDEN", {
			message: member
				? "Insufficient role for this operation"
				: "You are not a member of the organization",
		});
	}
	return member as Member;
}

async function getUserMembershipsByOrg(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<Map<string, Member>> {
	const members = await ctx.context.adapter.findMany<Member>({
		model: "member",
		where: [{ field: "userId", value: userId }],
	});
	return new Map(members.map((member) => [member.organizationId, member]));
}

function normalizeSCIMProvider(provider: SCIMProvider) {
	return {
		id: provider.id,
		providerId: provider.providerId,
		organizationId: provider.organizationId ?? null,
	};
}

async function findOrganizationMember(
	ctx: GenericEndpointContext,
	userId: string,
	organizationId: string,
): Promise<Member | null> {
	return ctx.context.adapter.findOne<Member>({
		model: "member",
		where: [
			{
				field: "userId",
				value: userId,
			},
			{
				field: "organizationId",
				value: organizationId,
			},
		],
	});
}

async function canLinkExistingUser(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
	existingUser: User,
	email: string,
): Promise<boolean> {
	const policy = opts.linkExistingUsers;
	if (!policy) return false;
	if (policy === true) return true;

	const { organizationId, providerId } = ctx.context.scimProvider;

	// Empty policy objects do not opt in to linking.
	const hasConstraint =
		policy.requireExistingOrgMembership === true ||
		typeof policy.shouldLinkUser === "function";
	if (!hasConstraint) return false;

	if (policy.requireExistingOrgMembership) {
		if (!organizationId) return false;
		const member = await findOrganizationMember(
			ctx,
			existingUser.id,
			organizationId,
		);
		if (!member) return false;
	}

	if (policy.shouldLinkUser) {
		const ok = await policy.shouldLinkUser({
			user: existingUser,
			email,
			provider: { providerId, organizationId },
		});
		if (!ok) return false;
	}

	return true;
}

async function checkSCIMProviderAccess(
	ctx: GenericEndpointContext,
	user: User,
	providerId: string,
	organizationId: string,
	opts: SCIMOptions,
): Promise<SCIMProvider> {
	const provider = await ctx.context.adapter.findOne<SCIMProvider>({
		model: "scimProvider",
		where: [
			{ field: "providerId", value: providerId },
			{ field: "organizationId", value: organizationId },
		],
	});

	if (!provider) {
		throw new APIError("NOT_FOUND", {
			message: "SCIM provider not found",
		});
	}

	await assertOrgAccess(ctx, opts, user, organizationId);

	return provider;
}

async function assertSCIMEmailAvailable(
	ctx: GenericEndpointContext,
	email: string,
	userId: string,
): Promise<void> {
	const existing = await ctx.context.adapter.findOne<User>({
		model: "user",
		where: [{ field: "email", value: email.toLowerCase() }],
	});
	if (existing && existing.id !== userId) {
		throw new SCIMAPIError("CONFLICT", {
			detail: "Email already in use",
			scimType: "uniqueness",
		});
	}
}

async function deprovisionFromOrg(
	ctx: GenericEndpointContext,
	{
		user,
		account,
		organizationId,
		providerId,
		unlinkAccount,
	}: {
		user: User;
		account: Account | null;
		organizationId: string;
		providerId: string;
		/** Keep the link for reversible `active: false` deactivation. */
		unlinkAccount: boolean;
	},
): Promise<void> {
	const organizationPlugin = ctx.context.getPlugin("organization");
	if (!organizationPlugin) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail:
				"Organization-scoped SCIM deprovisioning requires the organization plugin",
		});
	}
	const orgOptions = organizationPlugin.options;
	const orgAdapter = getOrgAdapter(ctx.context, orgOptions);
	const member = await findOrganizationMember(ctx, user.id, organizationId);
	const organization = member
		? await orgAdapter.findOrganizationById(organizationId)
		: null;

	if (member && organization) {
		await orgOptions?.organizationHooks?.beforeRemoveMember?.({
			member,
			user,
			organization,
		});
	}

	await ctx.context.adapter.transaction(async (trx) => {
		await removeUserFromSCIMGroups(trx, {
			providerId,
			organizationId,
			userId: user.id,
		});
		if (member) {
			await trx.delete({
				model: "member",
				where: [{ field: "id", value: member.id }],
			});
			if (orgOptions?.teams?.enabled) {
				const teams = await trx.findMany<{ id: string }>({
					model: "team",
					where: [{ field: "organizationId", value: organizationId }],
				});
				if (teams.length > 0) {
					await trx.deleteMany({
						model: "teamMember",
						where: [
							{ field: "userId", value: user.id },
							{
								field: "teamId",
								value: teams.map((team) => team.id),
								operator: "in",
							},
						],
					});
				}
			}
		}
		if (account && unlinkAccount) {
			await trx.delete({
				model: "account",
				where: [{ field: "id", value: account.id }],
			});
		}
	});

	if (member && organization) {
		await orgOptions?.organizationHooks?.afterRemoveMember?.({
			member,
			user,
			organization,
		});
	}
}

async function ensureOrgMembership(
	ctx: GenericEndpointContext,
	userId: string,
	organizationId: string,
): Promise<void> {
	const existing = await findOrganizationMember(ctx, userId, organizationId);
	if (existing) return;
	await ctx.context.adapter.create<Member>({
		model: "member",
		data: {
			userId,
			role: "member",
			createdAt: new Date(),
			organizationId,
		},
	});
}

async function revokeSessionsIfSoleOrgMembership(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<void> {
	const remaining = await ctx.context.adapter.findMany<Member>({
		model: "member",
		where: [{ field: "userId", value: userId }],
	});
	if (remaining.length === 0) {
		await ctx.context.internalAdapter.deleteUserSessions(userId);
	}
}

function resolveSCIMActiveDeactivation(
	ctx: GenericEndpointContext,
	userUpdate: Record<string, unknown>,
): boolean {
	if (!("banned" in userUpdate)) return false;
	const deactivating = userUpdate.banned === true;
	if (!ctx.context.hasPlugin("admin")) {
		if (deactivating) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail:
					"Setting `active: false` requires the admin plugin, which provides the enforced disabled-user state",
			});
		}
		// biome-ignore lint/performance/noDelete: the field must not reach updateUser without an admin `banned` column.
		delete userUpdate.banned;
		return false;
	}
	if (deactivating) {
		userUpdate.banReason = "Deactivated via SCIM";
		return true;
	}
	userUpdate.banReason = null;
	userUpdate.banExpires = null;
	return false;
}

export const generateSCIMToken = (opts: SCIMOptions) =>
	createAuthEndpoint(
		"/scim/generate-token",
		{
			method: "POST",
			body: generateSCIMTokenBodySchema,
			metadata: {
				openapi: {
					summary: "Generates a new SCIM token for the given provider",
					description:
						"Generates a new SCIM token to be used for SCIM operations",
					responses: {
						"201": {
							description: "SCIM token response",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											scimToken: {
												description: "SCIM token",
												type: "string",
											},
										},
									},
								},
							},
						},
					},
				},
			},
			use: [sessionMiddleware],
		},
		async (ctx) => {
			const { providerId, organizationId } = ctx.body;
			const user = ctx.context.session.user;

			// Prevent forged SCIM account namespace segments.
			if (providerId.includes(":")) {
				throw new APIError("BAD_REQUEST", {
					message: "Provider id contains forbidden characters",
				});
			}

			if (!organizationId) {
				throw new APIError("BAD_REQUEST", {
					message:
						"SCIM tokens must be scoped to an organization. Configure an app-level provider via `staticProviders` for single-tenant SCIM.",
				});
			}

			const member = await assertOrgAccess(ctx, opts, user, organizationId);

			if (opts.canGenerateToken) {
				const allowed = await opts.canGenerateToken({
					user,
					providerId,
					organizationId,
					member,
				});
				if (!allowed) {
					throw new APIError("FORBIDDEN", {
						message: "You are not allowed to generate a SCIM token",
					});
				}
			}

			const scimProvider = await ctx.context.adapter.findOne<SCIMProvider>({
				model: "scimProvider",
				where: [
					{ field: "providerId", value: providerId },
					{ field: "organizationId", value: organizationId },
				],
			});

			if (scimProvider) {
				await ctx.context.adapter.delete<SCIMProvider>({
					model: "scimProvider",
					where: [{ field: "id", value: scimProvider.id }],
				});
			}

			const baseToken = generateRandomString(24);
			const scimToken = base64Url.encode(
				`${baseToken}:${providerId}:${organizationId}`,
			);

			if (opts.beforeSCIMTokenGenerated) {
				await opts.beforeSCIMTokenGenerated({
					user,
					member,
					scimToken,
				});
			}

			const newSCIMProvider = await ctx.context.adapter.create<SCIMProvider>({
				model: "scimProvider",
				data: {
					providerId,
					organizationId,
					scimToken: await storeSCIMToken(ctx, opts, baseToken),
				},
			});

			if (opts.afterSCIMTokenGenerated) {
				await opts.afterSCIMTokenGenerated({
					user,
					member,
					scimToken,
					scimProvider: newSCIMProvider,
				});
			}

			ctx.setStatus(201);

			return ctx.json({
				scimToken,
			});
		},
	);

export const listSCIMProviderConnections = (opts: SCIMOptions) =>
	createAuthEndpoint(
		"/scim/list-provider-connections",
		{
			method: "GET",
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					operationId: "listSCIMProviderConnections",
					summary: "List SCIM providers",
					description:
						"Returns SCIM providers the user owns or has the required org role for.",
					responses: {
						"200": {
							description: "List of SCIM providers",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											providers: {
												type: "array",
												items: {
													type: "object",
													properties: {
														id: { type: "string" },
														providerId: { type: "string" },
														organizationId: {
															type: "string",
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
				},
			},
		},
		async (ctx) => {
			const user = ctx.context.session.user;
			const membershipsByOrg = ctx.context.hasPlugin("organization")
				? await getUserMembershipsByOrg(ctx, user.id)
				: new Map<string, Member>();

			const allProviders = await ctx.context.adapter.findMany<SCIMProvider>({
				model: "scimProvider",
			});

			const accessibleProviders: SCIMProvider[] = [];
			for (const provider of allProviders) {
				if (!provider.organizationId) continue;
				const member = membershipsByOrg.get(provider.organizationId) ?? null;
				const allowed = await isOrgActionAllowed(ctx, opts, {
					user,
					member,
					organizationId: provider.organizationId,
				});
				if (allowed) accessibleProviders.push(provider);
			}

			const providers = accessibleProviders.map((p) =>
				normalizeSCIMProvider(p),
			);

			return ctx.json({ providers });
		},
	);

export const getSCIMProviderConnection = (opts: SCIMOptions) =>
	createAuthEndpoint(
		"/scim/get-provider-connection",
		{
			method: "GET",
			use: [sessionMiddleware],
			query: getSCIMProviderConnectionQuerySchema,
			metadata: {
				openapi: {
					operationId: "getSCIMProviderConnection",
					summary: "Get SCIM provider details",
					description: "Returns details for a specific SCIM provider",
					responses: {
						"200": {
							description: "SCIM provider details",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											id: { type: "string" },
											providerId: { type: "string" },
											organizationId: {
												type: "string",
												nullable: true,
											},
										},
									},
								},
							},
						},
						"404": {
							description: "Provider not found",
						},
						"403": {
							description: "Access denied",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { providerId, organizationId } = ctx.query;
			const user = ctx.context.session.user;

			const provider = await checkSCIMProviderAccess(
				ctx,
				user,
				providerId,
				organizationId,
				opts,
			);

			return ctx.json(normalizeSCIMProvider(provider));
		},
	);

export const deleteSCIMProviderConnection = (opts: SCIMOptions) =>
	createAuthEndpoint(
		"/scim/delete-provider-connection",
		{
			method: "POST",
			use: [sessionMiddleware],
			body: deleteSCIMProviderConnectionBodySchema,
			metadata: {
				openapi: {
					operationId: "deleteSCIMProviderConnection",
					summary: "Delete SCIM provider",
					description: "Deletes a SCIM provider and invalidates its token",
					responses: {
						"200": {
							description: "SCIM provider deleted successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											success: { type: "boolean" },
										},
									},
								},
							},
						},
						"404": {
							description: "Provider not found",
						},
						"403": {
							description: "Access denied",
						},
					},
				},
			},
		},
		async (ctx) => {
			const { providerId, organizationId } = ctx.body;
			const user = ctx.context.session.user;

			await checkSCIMProviderAccess(
				ctx,
				user,
				providerId,
				organizationId,
				opts,
			);

			await ctx.context.adapter.delete<SCIMProvider>({
				model: "scimProvider",
				where: [
					{ field: "providerId", value: providerId },
					{ field: "organizationId", value: organizationId },
				],
			});

			return ctx.json({ success: true });
		},
	);

export const createSCIMUser = (
	authMiddleware: AuthMiddleware,
	opts: SCIMOptions,
) =>
	createAuthEndpoint(
		"/scim/v2/Users",
		{
			method: "POST",
			body: APIUserSchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Create SCIM user.",
					description:
						"Provision a new user into the linked organization via SCIM. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.3",
					responses: {
						"201": {
							description: "SCIM user resource",
							content: {
								"application/json": {
									schema: OpenAPIUserResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const { organizationId } = ctx.context.scimProvider;
			const accountProviderId = scimAccountProviderId(ctx.context.scimProvider);
			const accountId = getAccountId(body.userName, body.externalId);

			const existingAccount = await ctx.context.adapter.findOne<Account>({
				model: "account",
				where: [
					{ field: "accountId", value: accountId },
					{ field: "providerId", value: accountProviderId },
				],
			});

			if (existingAccount) {
				throw new SCIMAPIError("CONFLICT", {
					detail: "User already exists",
					scimType: "uniqueness",
				});
			}

			if (body.active === false && !organizationId) {
				resolveSCIMActiveDeactivation(ctx, { banned: true });
			}

			const email = getUserPrimaryEmail(
				body.userName,
				body.emails,
			).toLowerCase();
			const name = getUserFullName(email, body.name);

			const existingUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: email }],
			});

			const createAccount = (userId: string) =>
				ctx.context.internalAdapter.createAccount({
					userId: userId,
					providerId: accountProviderId,
					accountId: accountId,
					accessToken: "",
					refreshToken: "",
				});

			const createUser = () =>
				ctx.context.internalAdapter.createUser(
					{
						email,
						name,
					},
					{ method: "scim" },
				);

			const createOrgMembership = async (userId: string) => {
				if (organizationId && body.active !== false) {
					await ensureOrgMembership(ctx, userId, organizationId);
				}
			};

			let user: User;
			let account: Account;

			if (existingUser) {
				const allowLink = await canLinkExistingUser(
					ctx,
					opts,
					existingUser,
					email,
				);
				if (!allowLink) {
					throw new SCIMAPIError("CONFLICT", {
						detail: "User already exists",
						scimType: "uniqueness",
					});
				}
				user = existingUser;
				account = await ctx.context.adapter.transaction<Account>(async () => {
					const account = await createAccount(user.id);
					await createOrgMembership(user.id);
					return account;
				});
			} else {
				[user, account] = await ctx.context.adapter.transaction<
					[User, Account]
				>(async () => {
					const user = await createUser();
					const account = await createAccount(user.id);
					await createOrgMembership(user.id);
					return [user, account];
				});
			}

			if (body.active === false && !organizationId) {
				const deactivation: Record<string, unknown> = { banned: true };
				resolveSCIMActiveDeactivation(ctx, deactivation);
				const banned = await ctx.context.internalAdapter.updateUser(
					user.id,
					deactivation,
				);
				if (banned) {
					user = banned;
				}
				await ctx.context.internalAdapter.deleteUserSessions(user.id);
			}

			const userResource = createUserResource(
				ctx.context.baseURL,
				user,
				account,
				undefined,
				organizationId ? body.active !== false : undefined,
			);

			ctx.setStatus(201);
			ctx.setHeader("location", userResource.meta.location);
			return ctx.json(userResource);
		},
	);

export const updateSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "PUT",
			body: APIUserSchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Update SCIM user.",
					description:
						"Updates an existing user into the linked organization via SCIM. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.3",
					responses: {
						"200": {
							description: "SCIM user resource",
							content: {
								"application/json": {
									schema: OpenAPIUserResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const body = ctx.body;
			const userId = ctx.params.userId;
			const { organizationId, providerId } = ctx.context.scimProvider;
			const accountProviderId = scimAccountProviderId(ctx.context.scimProvider);
			const accountId = getAccountId(body.userName, body.externalId);

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId: accountProviderId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			const email = getUserPrimaryEmail(
				body.userName,
				body.emails,
			).toLowerCase();
			const name = getUserFullName(email, body.name);
			const emailChanged = email !== user.email;

			if (emailChanged) {
				await assertSCIMEmailAvailable(ctx, email, userId);
			}

			const userUpdate: Record<string, unknown> = {
				email,
				name,
				updatedAt: new Date(),
			};
			if (emailChanged) {
				userUpdate.emailVerified = false;
			}
			// App-level providers map `active: false` to a global ban.
			if (!organizationId && body.active !== undefined) {
				userUpdate.banned = body.active === false;
			}
			const deactivating = organizationId
				? false
				: resolveSCIMActiveDeactivation(ctx, userUpdate);

			const [updatedUser, updatedAccount] =
				await ctx.context.adapter.transaction<[User | null, Account | null]>(
					async () => {
						const updatedUser = await ctx.context.internalAdapter.updateUser(
							userId,
							userUpdate,
						);

						const updatedAccount =
							await ctx.context.internalAdapter.updateAccount(account.id, {
								accountId,
								updatedAt: new Date(),
							});

						return [updatedUser, updatedAccount];
					},
				);

			// Keep org-scoped inactive users addressable for reactivation.
			let active: boolean | undefined;
			if (organizationId) {
				if (body.active === false) {
					await deprovisionFromOrg(ctx, {
						user,
						account,
						organizationId,
						providerId,
						unlinkAccount: false,
					});
					await revokeSessionsIfSoleOrgMembership(ctx, userId);
					active = false;
				} else if (body.active === true) {
					await ensureOrgMembership(ctx, userId, organizationId);
					active = true;
				} else {
					active = !!(await findOrganizationMember(
						ctx,
						userId,
						organizationId,
					));
				}
			} else if (deactivating) {
				await ctx.context.internalAdapter.deleteUserSessions(userId);
			}

			const groups = organizationId
				? await listUserSCIMGroupReferences(ctx, userId)
				: undefined;
			const userResource = createUserResource(
				ctx.context.baseURL,
				updatedUser!,
				updatedAccount,
				groups,
				active,
			);

			return ctx.json(userResource);
		},
	);

const listSCIMUsersQuerySchema = z
	.object({
		filter: z.string().optional(),
	})
	.optional();

export const listSCIMUsers = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users",
		{
			method: "GET",
			query: listSCIMUsersQuerySchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "List SCIM users",
					description:
						"Returns all users provisioned via SCIM for the linked organization. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.4.2",
					responses: {
						"200": {
							description: "SCIM user list",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											totalResults: { type: "number" },
											itemsPerPage: { type: "number" },
											startIndex: { type: "number" },
											Resources: {
												type: "array",
												items: OpenAPIUserResourceSchema,
											},
										},
									},
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const emptyListResponse = {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				totalResults: 0,
				startIndex: 1,
				itemsPerPage: 0,
				Resources: [],
			} as const;

			const apiFilters: SCIMFilterWhere[] = parseSCIMAPIUserFilter(
				ctx.query?.filter,
			);

			const accountProviderId = scimAccountProviderId(ctx.context.scimProvider);
			const accounts = await ctx.context.adapter.findMany<Account>({
				model: "account",
				where: [{ field: "providerId", value: accountProviderId }],
			});

			const accountUserIds = accounts.map((account) => account.userId);

			if (accountUserIds.length === 0) {
				return ctx.json(emptyListResponse);
			}

			const userFilters: SCIMFilterWhere[] = [
				{ field: "id", value: accountUserIds, operator: "in" },
			];

			const organizationId = ctx.context.scimProvider.organizationId;

			const users = await ctx.context.adapter.findMany<User>({
				model: "user",
				where: [...userFilters, ...apiFilters],
			});

			// Deactivated org users keep their SCIM account; membership sets `active`.
			const activeMemberIds = organizationId
				? new Set(
						(
							await ctx.context.adapter.findMany<Member>({
								model: "member",
								where: [
									{ field: "organizationId", value: organizationId },
									{
										field: "userId",
										value: users.map((user) => user.id),
										operator: "in",
									},
								],
							})
						).map((member) => member.userId),
					)
				: null;

			const accountByUserId = new Map(
				accounts.map((account) => [account.userId, account]),
			);
			const groupReferencesByUserId = organizationId
				? await listSCIMGroupReferencesByUser(
						ctx,
						users.map((user) => user.id),
					)
				: new Map();
			const resources = users.map((user) =>
				createUserResource(
					ctx.context.baseURL,
					user,
					accountByUserId.get(user.id),
					groupReferencesByUserId.get(user.id),
					activeMemberIds ? activeMemberIds.has(user.id) : undefined,
				),
			);

			return ctx.json({
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				totalResults: users.length,
				startIndex: 1,
				itemsPerPage: users.length,
				Resources: resources,
			});
		},
	);

export const getSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "GET",
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Get SCIM user details",
					description:
						"Returns the provisioned SCIM user details. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.4.1",
					responses: {
						"200": {
							description: "SCIM user resource",
							content: {
								"application/json": {
									schema: OpenAPIUserResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const userId = ctx.params.userId;
			const organizationId = ctx.context.scimProvider.organizationId;
			const accountProviderId = scimAccountProviderId(ctx.context.scimProvider);

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId: accountProviderId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			const groups = organizationId
				? await listUserSCIMGroupReferences(ctx, user.id)
				: undefined;
			const active = organizationId
				? !!(await findOrganizationMember(ctx, user.id, organizationId))
				: undefined;

			return ctx.json(
				createUserResource(ctx.context.baseURL, user, account, groups, active),
			);
		},
	);

const patchSCIMUserBodySchema = z.object({
	schemas: z
		.array(z.string())
		.refine(
			(s) => s.includes("urn:ietf:params:scim:api:messages:2.0:PatchOp"),
			{
				message: "Invalid schemas for PatchOp",
			},
		),
	Operations: z.array(
		z.object({
			op: z
				.string()
				.toLowerCase()
				.default("replace")
				.pipe(z.enum(["replace", "add", "remove"])),
			path: z.string().optional(),
			value: z.any(),
		}),
	),
});

export const patchSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "PATCH",
			body: patchSCIMUserBodySchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Patch SCIM user",
					description: "Updates fields on a SCIM user record",
					responses: {
						"204": {
							description: "Patch update applied correctly",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const userId = ctx.params.userId;
			const organizationId = ctx.context.scimProvider.organizationId;
			const providerId = ctx.context.scimProvider.providerId;
			const accountProviderId = scimAccountProviderId(ctx.context.scimProvider);

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId: accountProviderId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			const { user: userPatch, account: accountPatch } = buildUserPatch(
				user,
				ctx.body.Operations,
			);

			// Org-scoped `active` changes membership, not a global ban.
			let orgActive: boolean | undefined;
			if (organizationId && "banned" in userPatch) {
				orgActive = userPatch.banned !== true;
				// biome-ignore lint/performance/noDelete: drop the field so an org update never writes a global ban.
				delete userPatch.banned;
			}

			if (
				Object.keys(userPatch).length === 0 &&
				Object.keys(accountPatch).length === 0 &&
				orgActive === undefined
			) {
				throw new SCIMAPIError("BAD_REQUEST", {
					detail: "No valid fields to update",
				});
			}

			if (
				typeof userPatch.email === "string" &&
				userPatch.email !== user.email
			) {
				await assertSCIMEmailAvailable(ctx, userPatch.email, userId);
				userPatch.emailVerified = false;
			}

			const deactivating = organizationId
				? false
				: resolveSCIMActiveDeactivation(ctx, userPatch);

			await Promise.all([
				Object.keys(userPatch).length > 0
					? ctx.context.internalAdapter.updateUser(userId, {
							...userPatch,
							updatedAt: new Date(),
						})
					: Promise.resolve(),
				Object.keys(accountPatch).length > 0
					? ctx.context.internalAdapter.updateAccount(account.id, {
							...accountPatch,
							updatedAt: new Date(),
						})
					: Promise.resolve(),
			]);

			if (organizationId) {
				if (orgActive === false) {
					await deprovisionFromOrg(ctx, {
						user,
						account,
						organizationId,
						providerId,
						unlinkAccount: false,
					});
					await revokeSessionsIfSoleOrgMembership(ctx, userId);
				} else if (orgActive === true) {
					await ensureOrgMembership(ctx, userId, organizationId);
				}
			} else if (deactivating) {
				await ctx.context.internalAdapter.deleteUserSessions(userId);
			}

			ctx.setStatus(204);
			return;
		},
	);

const listSCIMGroupsQuerySchema = z
	.object({
		filter: z.string().optional(),
		startIndex: z.coerce.number().int().positive().optional(),
		count: z.coerce.number().int().nonnegative().optional(),
	})
	.optional();

const patchSCIMGroupBodySchema = z.object({
	schemas: z
		.array(z.string())
		.refine(
			(s) => s.includes("urn:ietf:params:scim:api:messages:2.0:PatchOp"),
			{
				message: "Invalid schemas for PatchOp",
			},
		),
	Operations: z.array(
		z.object({
			op: z
				.string()
				.toLowerCase()
				.default("replace")
				.pipe(z.enum(["replace", "add", "remove"])),
			path: z.string().optional(),
			value: z.unknown().optional(),
		}),
	),
});

export const createSCIMGroup = (
	authMiddleware: AuthMiddleware,
	opts: SCIMOptions,
) =>
	createAuthEndpoint(
		"/scim/v2/Groups",
		{
			method: "POST",
			body: APIGroupSchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Create SCIM group.",
					description:
						"Provision a durable SCIM Group into the linked organization.",
					responses: {
						"201": {
							description: "SCIM group resource",
							content: {
								"application/json": {
									schema: OpenAPIGroupResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const groupView = await createSCIMGroupResource(ctx, opts, ctx.body);
			const groupResource = createGroupResource(
				ctx.context.baseURL,
				groupView.group,
				groupView.members,
			);

			ctx.setStatus(201);
			ctx.setHeader("location", groupResource.meta.location);
			return ctx.json(groupResource);
		},
	);

export const listSCIMGroups = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Groups",
		{
			method: "GET",
			query: listSCIMGroupsQuerySchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "List SCIM groups",
					description:
						"Returns durable SCIM Groups provisioned for the linked organization.",
					responses: {
						"200": {
							description: "SCIM group list",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											totalResults: { type: "number" },
											itemsPerPage: { type: "number" },
											startIndex: { type: "number" },
											Resources: {
												type: "array",
												items: OpenAPIGroupResourceSchema,
											},
										},
									},
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const listResponse = await listSCIMGroupResources(ctx, ctx.query);
			return ctx.json({
				...listResponse,
				Resources: listResponse.Resources.map((groupView) =>
					createGroupResource(
						ctx.context.baseURL,
						groupView.group,
						groupView.members,
					),
				),
			});
		},
	);

export const getSCIMGroup = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "GET",
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Get SCIM group details",
					description: "Returns a provisioned SCIM Group resource.",
					responses: {
						"200": {
							description: "SCIM group resource",
							content: {
								"application/json": {
									schema: OpenAPIGroupResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const groupView = await findSCIMGroupResource(ctx, ctx.params.groupId);
			return ctx.json(
				createGroupResource(
					ctx.context.baseURL,
					groupView.group,
					groupView.members,
				),
			);
		},
	);

export const updateSCIMGroup = (
	authMiddleware: AuthMiddleware,
	opts: SCIMOptions,
) =>
	createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "PUT",
			body: APIGroupSchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Update SCIM group.",
					description: "Replace a durable SCIM Group resource.",
					responses: {
						"200": {
							description: "SCIM group resource",
							content: {
								"application/json": {
									schema: OpenAPIGroupResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const groupView = await replaceSCIMGroupResource(
				ctx,
				opts,
				ctx.params.groupId,
				ctx.body,
			);
			return ctx.json(
				createGroupResource(
					ctx.context.baseURL,
					groupView.group,
					groupView.members,
				),
			);
		},
	);

export const patchSCIMGroup = (
	authMiddleware: AuthMiddleware,
	opts: SCIMOptions,
) =>
	createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "PATCH",
			body: patchSCIMGroupBodySchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Patch SCIM group",
					description: "Applies an atomic SCIM PATCH to a Group resource.",
					responses: {
						"200": {
							description: "SCIM group resource",
							content: {
								"application/json": {
									schema: OpenAPIGroupResourceSchema,
								},
							},
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const groupView = await applySCIMGroupPatch(
				ctx,
				opts,
				ctx.params.groupId,
				ctx.body,
			);
			return ctx.json(
				createGroupResource(
					ctx.context.baseURL,
					groupView.group,
					groupView.members,
				),
			);
		},
	);

export const deleteSCIMGroup = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "DELETE",
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: [...supportedMediaTypes, ""],
				openapi: {
					summary: "Delete SCIM group",
					description: "Deletes a SCIM Group resource and its role grants.",
					responses: {
						"204": {
							description: "Delete applied successfully",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			await deleteSCIMGroupResource(ctx, ctx.params.groupId);
			ctx.setStatus(204);
			return;
		},
	);

export const deleteSCIMUser = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "DELETE",
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: [...supportedMediaTypes, ""],
				openapi: {
					summary: "Delete SCIM user",
					description:
						"Deletes (or deactivates) a user within the linked organization.",
					responses: {
						"204": {
							description: "Delete applied successfully",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			},
			use: [authMiddleware],
		},
		async (ctx) => {
			const userId = ctx.params.userId;
			const providerId = ctx.context.scimProvider.providerId;
			const organizationId = ctx.context.scimProvider.organizationId;
			const accountProviderId = scimAccountProviderId(ctx.context.scimProvider);

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId: accountProviderId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			if (organizationId) {
				await deprovisionFromOrg(ctx, {
					user,
					account,
					organizationId,
					providerId,
					unlinkAccount: true,
				});
				await revokeSessionsIfSoleOrgMembership(ctx, userId);
				ctx.setStatus(204);
				return;
			}

			const accounts = await ctx.context.internalAdapter.findAccounts(userId);
			const hasOtherAccounts = accounts.some((a) => a.id !== account.id);

			if (hasOtherAccounts) {
				await ctx.context.internalAdapter.deleteAccount(account.id);
				ctx.setStatus(204);
				return;
			}

			await ctx.context.internalAdapter.deleteUserSessions(userId);
			await ctx.context.internalAdapter.deleteUser(userId);

			ctx.setStatus(204);
			return;
		},
	);

export const getSCIMServiceProviderConfig = createAuthEndpoint(
	"/scim/v2/ServiceProviderConfig",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Configuration",
				description:
					"Standard SCIM metadata endpoint used by identity providers. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: ServiceProviderOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		return ctx.json({
			patch: { supported: true },
			bulk: { supported: false },
			filter: { supported: true },
			changePassword: { supported: false },
			sort: { supported: false },
			etag: { supported: false },
			authenticationSchemes: [
				{
					name: "OAuth Bearer Token",
					description:
						"Authentication scheme using the Authorization header with a bearer token tied to an organization.",
					specUri: "http://www.rfc-editor.org/info/rfc6750",
					type: "oauthbearertoken",
					primary: true,
				},
			],
			schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
			meta: {
				resourceType: "ServiceProviderConfig",
			},
		});
	},
);

export const getSCIMSchemas = createAuthEndpoint(
	"/scim/v2/Schemas",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Configuration Schemas",
				description:
					"Standard SCIM metadata endpoint used by identity providers to acquire information about supported schemas. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: SCIMSchemaOpenAPISchema,
								},
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		return ctx.json({
			totalResults: supportedSCIMSchemas.length,
			itemsPerPage: supportedSCIMSchemas.length,
			startIndex: 1,
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			Resources: supportedSCIMSchemas.map((s) => {
				return {
					...s,
					meta: {
						...s.meta,
						location: getResourceURL(s.meta.location, ctx.context.baseURL),
					},
				};
			}),
		});
	},
);

export const getSCIMSchema = createAuthEndpoint(
	"/scim/v2/Schemas/:schemaId",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM a Service Provider Configuration Schema",
				description:
					"Standard SCIM metadata endpoint used by identity providers to acquire information about a given schema. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: SCIMSchemaOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const schema = supportedSCIMSchemas.find(
			(s) => s.id === ctx.params.schemaId,
		);

		if (!schema) {
			throw new SCIMAPIError("NOT_FOUND", {
				detail: "Schema not found",
			});
		}

		return ctx.json({
			...schema,
			meta: {
				...schema.meta,
				location: getResourceURL(schema.meta.location, ctx.context.baseURL),
			},
		});
	},
);

export const getSCIMResourceTypes = createAuthEndpoint(
	"/scim/v2/ResourceTypes",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Supported Resource Types",
				description:
					"Standard SCIM metadata endpoint used by identity providers to get a list of server supported types. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										totalResults: { type: "number" },
										itemsPerPage: { type: "number" },
										startIndex: { type: "number" },
										Resources: {
											type: "array",
											items: ResourceTypeOpenAPISchema,
										},
									},
								},
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		return ctx.json({
			totalResults: supportedSCIMResourceTypes.length,
			itemsPerPage: supportedSCIMResourceTypes.length,
			startIndex: 1,
			schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
			Resources: supportedSCIMResourceTypes.map((s) => {
				return {
					...s,
					meta: {
						...s.meta,
						location: getResourceURL(s.meta.location, ctx.context.baseURL),
					},
				};
			}),
		});
	},
);

export const getSCIMResourceType = createAuthEndpoint(
	"/scim/v2/ResourceTypes/:resourceTypeId",
	{
		method: "GET",
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: supportedMediaTypes,
			openapi: {
				summary: "SCIM Service Provider Supported Resource Type",
				description:
					"Standard SCIM metadata endpoint used by identity providers to get a server supported type. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
				responses: {
					"200": {
						description: "SCIM metadata object",
						content: {
							"application/json": {
								schema: ResourceTypeOpenAPISchema,
							},
						},
					},
					...SCIMErrorOpenAPISchemas,
				},
			},
		},
	},
	async (ctx) => {
		const resourceType = supportedSCIMResourceTypes.find(
			(s) => s.id === ctx.params.resourceTypeId,
		);

		if (!resourceType) {
			throw new SCIMAPIError("NOT_FOUND", {
				detail: "Resource type not found",
			});
		}

		return ctx.json({
			...resourceType,
			meta: {
				...resourceType.meta,
				location: getResourceURL(
					resourceType.meta.location,
					ctx.context.baseURL,
				),
			},
		});
	},
);

const findUserById = async (
	adapter: DBAdapter,
	{ userId, providerId }: { userId: string; providerId: string },
) => {
	const account = await adapter.findOne<Account>({
		model: "account",
		where: [
			{ field: "userId", value: userId },
			{ field: "providerId", value: providerId },
		],
	});

	if (!account) {
		return { user: null, account: null };
	}

	const user = await adapter.findOne<User>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});

	if (!user) {
		return { user: null, account: null };
	}

	return { user, account };
};

const parseSCIMAPIUserFilter = (filter?: string) => {
	let filters: SCIMFilterWhere[] = [];

	try {
		filters = filter ? parseSCIMUserFilter(filter) : [];
	} catch (error) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail:
				error instanceof SCIMParseError ? error.message : "Invalid SCIM filter",
			scimType: "invalidFilter",
		});
	}

	return filters;
};
