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
import * as z from "zod";
import {
	APIGroupSchema,
	OpenAPIGroupResourceSchema,
	SCIMGroupResourceSchema,
	SCIMGroupResourceType,
} from "./group-schemas";
import { getAccountId, getUserFullName, getUserPrimaryEmail } from "./mappings";
import type { AuthMiddleware } from "./middlewares";
import { buildUserPatch } from "./patch-operations";
import { SCIMAPIError, SCIMErrorOpenAPISchemas } from "./scim-error";
import type { DBFilter } from "./scim-filters";
import {
	parseSCIMGroupFilter,
	parseSCIMUserFilter,
	SCIMParseError,
} from "./scim-filters";
import {
	ResourceTypeOpenAPISchema,
	SCIMSchemaOpenAPISchema,
	ServiceProviderOpenAPISchema,
} from "./scim-metadata";
import { createGroupResource, createUserResource } from "./scim-resources";
import { storeSCIMToken } from "./scim-tokens";
import type {
	SCIMGroup,
	SCIMGroupMember,
	SCIMGroupMembership,
	SCIMOptions,
	SCIMProvider,
} from "./types";
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
	providerId: z.string().meta({ description: "Unique provider identifier" }),
	organizationId: z
		.string()
		.optional()
		.meta({ description: "Optional organization id" }),
});

const getSCIMProviderConnectionQuerySchema = z.object({
	providerId: z.string(),
});

const deleteSCIMProviderConnectionBodySchema = z.object({
	providerId: z.string(),
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

function resolveRequiredRoles(
	ctx: GenericEndpointContext,
	opts: SCIMOptions,
): string[] {
	if (opts.requiredRole) {
		return opts.requiredRole;
	}

	const creatorRole =
		ctx.context.getPlugin("organization")?.options?.creatorRole;

	return Array.from(new Set(["admin", creatorRole ?? "owner"]));
}

function isProviderOwnershipEnabled(opts: SCIMOptions): boolean {
	return opts.providerOwnership?.enabled ?? false;
}

async function getSCIMUserOrgMemberships(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<Map<string, string[]>> {
	const members = await ctx.context.adapter.findMany<Member>({
		model: "member",
		where: [{ field: "userId", value: userId }],
	});
	return new Map(
		members.map((member) => [
			member.organizationId,
			parseMemberRoles(member.role),
		]),
	);
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

async function assertSCIMProviderAccess(
	ctx: GenericEndpointContext,
	userId: string,
	provider: SCIMProvider,
	requiredRole: string[],
): Promise<void> {
	if (provider.organizationId) {
		if (!ctx.context.hasPlugin("organization")) {
			throw new APIError("FORBIDDEN", {
				message: "Organization plugin is required to access this SCIM provider",
			});
		}

		const member = await findOrganizationMember(
			ctx,
			userId,
			provider.organizationId,
		);

		if (!member) {
			throw new APIError("FORBIDDEN", {
				message:
					"You must be a member of the organization to access this provider",
			});
		}

		if (!hasRequiredRole(member.role, requiredRole)) {
			throw new APIError("FORBIDDEN", {
				message: "Insufficient role for this operation",
			});
		}
	} else if (provider.userId && provider.userId !== userId) {
		throw new APIError("FORBIDDEN", {
			message: "You must be the owner to access this provider",
		});
	}
}

async function checkSCIMProviderAccess(
	ctx: GenericEndpointContext,
	userId: string,
	providerId: string,
	requiredRole: string[],
): Promise<SCIMProvider> {
	const provider = await ctx.context.adapter.findOne<SCIMProvider>({
		model: "scimProvider",
		where: [{ field: "providerId", value: providerId }],
	});

	if (!provider) {
		throw new APIError("NOT_FOUND", {
			message: "SCIM provider not found",
		});
	}

	await assertSCIMProviderAccess(ctx, userId, provider, requiredRole);

	return provider;
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
			const requiredRole = resolveRequiredRoles(ctx, opts);

			if (providerId.includes(":")) {
				throw new APIError("BAD_REQUEST", {
					message: "Provider id contains forbidden characters",
				});
			}

			if (organizationId && !ctx.context.hasPlugin("organization")) {
				throw new APIError("BAD_REQUEST", {
					message:
						"Restricting a token to an organization requires the organization plugin",
				});
			}

			let member: Member | null = null;
			if (organizationId) {
				member = await findOrganizationMember(ctx, user.id, organizationId);

				if (!member) {
					throw new APIError("FORBIDDEN", {
						message: "You are not a member of the organization",
					});
				}

				if (!hasRequiredRole(member.role, requiredRole)) {
					throw new APIError("FORBIDDEN", {
						message: "Insufficient role for this operation",
					});
				}
			}

			const scimProvider = await ctx.context.adapter.findOne<SCIMProvider>({
				model: "scimProvider",
				where: [
					{ field: "providerId", value: providerId },
					...(organizationId
						? [{ field: "organizationId", value: organizationId }]
						: []),
				],
			});

			if (scimProvider) {
				await assertSCIMProviderAccess(
					ctx,
					user.id,
					scimProvider,
					requiredRole,
				);
				await ctx.context.adapter.delete<SCIMProvider>({
					model: "scimProvider",
					where: [{ field: "id", value: scimProvider.id }],
				});
			}

			const baseToken = generateRandomString(24);
			const scimToken = base64Url.encode(
				`${baseToken}:${providerId}${organizationId ? `:${organizationId}` : ""}`,
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
					...(isProviderOwnershipEnabled(opts) ? { userId: user.id } : {}),
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
			const userId = ctx.context.session.user.id;
			const requiredRole = resolveRequiredRoles(ctx, opts);
			const orgMemberships: Map<string, string[]> = ctx.context.hasPlugin(
				"organization",
			)
				? await getSCIMUserOrgMemberships(ctx, userId)
				: new Map();

			const allProviders = await ctx.context.adapter.findMany<SCIMProvider>({
				model: "scimProvider",
			});

			const accessibleProviders = allProviders.filter((p) => {
				if (p.organizationId) {
					const roles = orgMemberships.get(p.organizationId);
					return roles
						? !requiredRole.length ||
								roles.some((role) => requiredRole.includes(role))
						: false;
				}
				// Owned by this user, or legacy provider without ownership tracking
				return p.userId === userId || !p.userId;
			});

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
			const { providerId } = ctx.query;
			const userId = ctx.context.session.user.id;
			const requiredRole = resolveRequiredRoles(ctx, opts);

			const provider = await checkSCIMProviderAccess(
				ctx,
				userId,
				providerId,
				requiredRole,
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
			const { providerId } = ctx.body;
			const userId = ctx.context.session.user.id;
			const requiredRole = resolveRequiredRoles(ctx, opts);

			await checkSCIMProviderAccess(ctx, userId, providerId, requiredRole);

			await ctx.context.adapter.delete<SCIMProvider>({
				model: "scimProvider",
				where: [{ field: "providerId", value: providerId }],
			});

			return ctx.json({ success: true });
		},
	);

export const createSCIMUser = (authMiddleware: AuthMiddleware) =>
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
			const providerId = ctx.context.scimProvider.providerId;
			const accountId = getAccountId(body.userName, body.externalId);

			const existingAccount = await ctx.context.adapter.findOne<Account>({
				model: "account",
				where: [
					{ field: "accountId", value: accountId },
					{ field: "providerId", value: providerId },
				],
			});

			if (existingAccount) {
				throw new SCIMAPIError("CONFLICT", {
					detail: "User already exists",
					scimType: "uniqueness",
				});
			}

			const email = getUserPrimaryEmail(body.userName, body.emails);
			const name = getUserFullName(email, body.name);

			const existingUser = await ctx.context.adapter.findOne<User>({
				model: "user",
				where: [{ field: "email", value: email }],
			});

			const createAccount = (userId: string) =>
				ctx.context.internalAdapter.createAccount({
					userId: userId,
					providerId: providerId,
					accountId: accountId,
					accessToken: "",
					refreshToken: "",
				});

			const createUser = () =>
				ctx.context.internalAdapter.createUser({
					email,
					name,
				});

			const createOrgMembership = async (userId: string) => {
				const organizationId = ctx.context.scimProvider.organizationId;

				if (organizationId) {
					const isOrgMember = await ctx.context.adapter.findOne({
						model: "member",
						where: [
							{ field: "organizationId", value: organizationId },
							{ field: "userId", value: userId },
						],
					});

					if (!isOrgMember) {
						return await ctx.context.adapter.create<Member>({
							model: "member",
							data: {
								userId: userId,
								role: "member",
								createdAt: new Date(),
								organizationId,
							},
						});
					}
				}
			};

			let user: User;
			let account: Account;

			if (existingUser) {
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

			const userResource = createUserResource(
				ctx.context.baseURL,
				user,
				account,
				await getUserSCIMGroups(ctx, user.id),
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
			const accountId = getAccountId(body.userName, body.externalId);

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			const [updatedUser, updatedAccount] =
				await ctx.context.adapter.transaction<[User | null, Account | null]>(
					async () => {
						const email = getUserPrimaryEmail(body.userName, body.emails);
						const name = getUserFullName(email, body.name);

						const updatedUser = await ctx.context.internalAdapter.updateUser(
							userId,
							{
								email,
								name,
								updatedAt: new Date(),
							},
						);

						const updatedAccount =
							await ctx.context.internalAdapter.updateAccount(account.id, {
								accountId,
								updatedAt: new Date(),
							});

						return [updatedUser, updatedAccount];
					},
				);

			const userResource = createUserResource(
				ctx.context.baseURL,
				updatedUser!,
				updatedAccount,
				await getUserSCIMGroups(ctx, updatedUser!.id),
			);

			return ctx.json(userResource);
		},
	);

const listSCIMUsersQuerySchema = z
	.object({
		filter: z.string().optional(),
	})
	.optional();

const listSCIMGroupsQuerySchema = z
	.object({
		filter: z.string().optional(),
		startIndex: z.coerce.number().int().min(1).optional(),
		count: z.coerce.number().int().min(0).optional(),
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
			value: z.any().optional(),
		}),
	),
});

function getOrganizationId(ctx: GenericEndpointContext): string {
	const organizationId = ctx.context.scimProvider.organizationId;
	if (!organizationId) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "SCIM Groups require an organization-scoped token",
			scimType: "invalidValue",
		});
	}
	return organizationId;
}

function getGroupIdFromParam(groupId: string) {
	return decodeURIComponent(groupId);
}

function validateRoleName(role: string): string {
	const trimmedRole = role.trim();
	if (!trimmedRole) {
		return "";
	}
	if (trimmedRole.includes(",")) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail:
				'SCIM Group role names cannot contain ",". Return multiple roles as an array from mapGroupToRole.',
			scimType: "invalidValue",
		});
	}
	return trimmedRole;
}

function normalizeRoleSet(
	roles: string | string[],
	options: { splitComma?: boolean } = {},
): string[] {
	const roleList = Array.isArray(roles) ? roles : [roles];
	const normalizedRoles = roleList.flatMap((role) =>
		options.splitComma ? parseMemberRoles(role) : [validateRoleName(role)],
	);
	return Array.from(new Set(normalizedRoles.filter(Boolean)));
}

function serializeRoleSet(roles: string[]): string {
	return roles.join(",");
}

function memberHasRoles(member: Member, roles: string[]): boolean {
	const memberRoles = parseMemberRoles(member.role);
	return roles.every((role) => memberRoles.includes(role));
}

function addRolesToMember(member: Member, roles: string[]): string {
	return serializeRoleSet(
		Array.from(new Set([...parseMemberRoles(member.role), ...roles])),
	);
}

function removeRolesFromMember(member: Member, roles: string[]): string {
	return serializeRoleSet(
		parseMemberRoles(member.role).filter((role) => !roles.includes(role)),
	);
}

function groupMembershipFromRoles(
	baseURL: string,
	roles: string[],
): SCIMGroupMembership[] {
	return roles.map((role) => ({
		value: role,
		$ref: getResourceURL(
			`/scim/v2/Groups/${encodeURIComponent(role)}`,
			baseURL,
		),
		display: role,
	}));
}

async function resolveGroupRoles(
	opts: SCIMOptions,
	group: SCIMGroup,
): Promise<string[]> {
	const mappedRoles = opts.mapGroupToRole
		? await opts.mapGroupToRole(group)
		: group.displayName;
	const roles = normalizeRoleSet(mappedRoles);
	if (roles.length === 0) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "Group must map to at least one organization role",
			scimType: "invalidValue",
		});
	}
	return roles;
}

async function findSCIMProviderAccounts(ctx: GenericEndpointContext) {
	return ctx.context.adapter.findMany<Account>({
		model: "account",
		where: [
			{ field: "providerId", value: ctx.context.scimProvider.providerId },
		],
	});
}

async function findSCIMOrganizationMembers(ctx: GenericEndpointContext) {
	const organizationId = getOrganizationId(ctx);
	const accounts = await findSCIMProviderAccounts(ctx);
	const accountUserIds = accounts.map((account) => account.userId);

	if (accountUserIds.length === 0) {
		return { members: [] as Member[], users: [] as User[] };
	}

	const [members, users] = await Promise.all([
		ctx.context.adapter.findMany<Member>({
			model: "member",
			where: [
				{ field: "organizationId", value: organizationId },
				{ field: "userId", value: accountUserIds, operator: "in" },
			],
		}),
		ctx.context.adapter.findMany<User>({
			model: "user",
			where: [{ field: "id", value: accountUserIds, operator: "in" }],
		}),
	]);

	return { members, users };
}

function getUserDisplay(user: User): string {
	return user.name || user.email || user.id;
}

function userToMemberRef(user: User, baseURL: string): SCIMGroupMembership {
	return {
		value: user.id,
		$ref: getResourceURL(`/scim/v2/Users/${user.id}`, baseURL),
		display: getUserDisplay(user),
	};
}

async function replaceGroupMembers(
	ctx: GenericEndpointContext,
	roles: string[],
	memberUserIds: Set<string>,
) {
	const { members } = await findSCIMOrganizationMembers(ctx);
	await Promise.all(
		members.map((member) =>
			updateExistingMemberRoles(ctx, member, (currentMember) =>
				memberUserIds.has(member.userId)
					? addRolesToMember(currentMember, roles)
					: removeRolesFromMember(currentMember, roles),
			),
		),
	);
}

async function addGroupRoles(
	ctx: GenericEndpointContext,
	roles: string[],
	users: User[],
) {
	const membersByUserId = await findOrganizationMembersByUserIds(
		ctx,
		users.map((user) => user.id),
	);
	await Promise.all(
		users.map((user) => {
			const member = membersByUserId.get(user.id);
			if (!member) {
				throwGroupMemberNotFound();
			}
			return updateExistingMemberRoles(ctx, member, (currentMember) =>
				addRolesToMember(currentMember, roles),
			);
		}),
	);
}

async function removeGroupRoles(
	ctx: GenericEndpointContext,
	roles: string[],
	users: User[],
) {
	const membersByUserId = await findOrganizationMembersByUserIds(
		ctx,
		users.map((user) => user.id),
	);
	await Promise.all(
		users.map((user) => {
			const member = membersByUserId.get(user.id);
			if (!member) {
				throwGroupMemberNotFound();
			}
			return updateExistingMemberRoles(ctx, member, (currentMember) =>
				removeRolesFromMember(currentMember, roles),
			);
		}),
	);
}

function getPatchMemberFromPath(path?: string): SCIMGroupMember | null {
	if (!path) {
		return null;
	}

	const match = path.match(/^members\s*\[\s*value\s+eq\s+"([^"]+)"\s*\]$/i);
	if (!match) {
		return null;
	}

	return { value: match[1] };
}

function normalizePatchMembers(operation: {
	op: "replace" | "add" | "remove";
	path?: string;
	value?: unknown;
}): { members: SCIMGroupMember[]; removeAll?: boolean } | null {
	const path = operation.path?.trim();
	const memberFromPath = getPatchMemberFromPath(path);

	if (memberFromPath) {
		return { members: [memberFromPath] };
	}

	if (path && path.toLowerCase() !== "members") {
		return null;
	}

	if (operation.value === undefined) {
		if (operation.op === "remove") {
			return { members: [], removeAll: true };
		}
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "Group member patch operation must include a value",
			scimType: "invalidValue",
		});
	}

	if (Array.isArray(operation.value)) {
		return { members: operation.value as SCIMGroupMember[] };
	}
	const value = operation.value as Record<string, unknown> | undefined;
	if (value?.members && Array.isArray(value.members)) {
		return { members: value.members as SCIMGroupMember[] };
	}
	return { members: [operation.value as SCIMGroupMember] };
}

function getSCIMMemberValue(member: SCIMGroupMember): string {
	if (member.type?.toLowerCase() === "group") {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail: "Nested SCIM Groups are not supported",
			scimType: "invalidValue",
		});
	}

	if (member.value) {
		return member.value;
	}

	if (member.$ref) {
		if (member.$ref.includes("/Groups/")) {
			throw new SCIMAPIError("BAD_REQUEST", {
				detail: "Nested SCIM Groups are not supported",
				scimType: "invalidValue",
			});
		}
		const userId = member.$ref.match(/\/Users\/([^/?#]+)/)?.[1];
		if (userId) {
			return decodeURIComponent(userId);
		}
	}

	throw new SCIMAPIError("BAD_REQUEST", {
		detail: "Group member must reference a SCIM User",
		scimType: "invalidValue",
	});
}

async function resolveSCIMGroupUsers(
	ctx: GenericEndpointContext,
	members: SCIMGroupMember[] = [],
): Promise<User[]> {
	const organizationId = getOrganizationId(ctx);
	const providerId = ctx.context.scimProvider.providerId;
	const userIds = Array.from(
		new Set(members.map((member) => getSCIMMemberValue(member))),
	);

	if (userIds.length === 0) {
		return [];
	}

	const [accounts, organizationMembers, users] = await Promise.all([
		ctx.context.adapter.findMany<Account>({
			model: "account",
			where: [
				{ field: "providerId", value: providerId },
				{ field: "userId", value: userIds, operator: "in" },
			],
		}),
		ctx.context.adapter.findMany<Member>({
			model: "member",
			where: [
				{ field: "organizationId", value: organizationId },
				{ field: "userId", value: userIds, operator: "in" },
			],
		}),
		ctx.context.adapter.findMany<User>({
			model: "user",
			where: [{ field: "id", value: userIds, operator: "in" }],
		}),
	]);

	const accountUserIds = new Set(accounts.map((account) => account.userId));
	const memberUserIds = new Set(
		organizationMembers.map((member) => member.userId),
	);
	const usersById = new Map(users.map((user) => [user.id, user]));

	return userIds.map((userId) => {
		const user = usersById.get(userId);
		if (!accountUserIds.has(userId) || !memberUserIds.has(userId) || !user) {
			throwGroupMemberNotFound();
		}
		return user;
	});
}

function throwGroupMemberNotFound(): never {
	throw new SCIMAPIError("BAD_REQUEST", {
		detail: "Group member target was not found",
		scimType: "noTarget",
	});
}

async function findOrganizationMembersByUserIds(
	ctx: GenericEndpointContext,
	userIds: string[],
): Promise<Map<string, Member>> {
	if (userIds.length === 0) {
		return new Map();
	}

	const organizationId = getOrganizationId(ctx);
	const members = await ctx.context.adapter.findMany<Member>({
		model: "member",
		where: [
			{ field: "organizationId", value: organizationId },
			{ field: "userId", value: userIds, operator: "in" },
		],
	});

	return new Map(members.map((member) => [member.userId, member]));
}

async function updateExistingMemberRoles(
	ctx: GenericEndpointContext,
	member: Member,
	updateRole: (member: Member) => string,
) {
	const role = updateRole(member);
	if (role === member.role) {
		return member;
	}

	return ctx.context.adapter.update<Member>({
		model: "member",
		where: [{ field: "id", value: member.id }],
		update: { role },
	});
}

function getGroupMembers(
	roles: string[],
	members: Member[],
	usersById: Map<string, User>,
	baseURL: string,
): SCIMGroupMembership[] {
	return members
		.filter((member) => memberHasRoles(member, roles))
		.map((member) => {
			const user = usersById.get(member.userId);
			if (!user) {
				return null;
			}
			return userToMemberRef(user, baseURL);
		})
		.filter((member): member is SCIMGroupMembership => Boolean(member));
}

async function getGroupResource(
	ctx: GenericEndpointContext,
	groupId: string,
	allowEmpty = true,
) {
	const roles = normalizeRoleSet(getGroupIdFromParam(groupId), {
		splitComma: true,
	});
	const { members, users } = await findSCIMOrganizationMembers(ctx);
	const usersById = new Map(users.map((user) => [user.id, user]));
	const groupMembers = getGroupMembers(
		roles,
		members,
		usersById,
		ctx.context.baseURL,
	);

	if (!allowEmpty && groupMembers.length === 0) {
		throw new SCIMAPIError("NOT_FOUND", {
			detail: "Group not found",
		});
	}

	return createGroupResource(ctx.context.baseURL, {
		id: serializeRoleSet(roles),
		members: groupMembers,
	});
}

async function getUserSCIMGroups(
	ctx: GenericEndpointContext,
	userId: string,
): Promise<SCIMGroupMembership[] | undefined> {
	const organizationId = ctx.context.scimProvider.organizationId;
	if (!organizationId) {
		return undefined;
	}

	const member = await ctx.context.adapter.findOne<Member>({
		model: "member",
		where: [
			{ field: "organizationId", value: organizationId },
			{ field: "userId", value: userId },
		],
	});

	return groupMembershipFromRoles(
		ctx.context.baseURL,
		parseMemberRoles(member?.role ?? ""),
	);
}

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

			const apiFilters: DBFilter[] = parseSCIMAPIUserFilter(ctx.query?.filter);

			ctx.context.logger.info("Querying result with filters: ", apiFilters);

			const providerId = ctx.context.scimProvider.providerId;
			const accounts = await ctx.context.adapter.findMany<Account>({
				model: "account",
				where: [{ field: "providerId", value: providerId }],
			});

			const accountUserIds = accounts.map((account) => account.userId);

			// No accounts exist for this provider

			if (accountUserIds.length === 0) {
				return ctx.json(emptyListResponse);
			}

			let userFilters: DBFilter[] = [
				{ field: "id", value: accountUserIds, operator: "in" },
			];

			const organizationId = ctx.context.scimProvider.organizationId;
			if (organizationId) {
				const members = await ctx.context.adapter.findMany<Member>({
					model: "member",
					where: [
						{ field: "organizationId", value: organizationId },
						{ field: "userId", value: accountUserIds, operator: "in" },
					],
				});

				const memberUserIds = members.map((member) => member.userId);

				// No members exist for this organization

				if (memberUserIds.length === 0) {
					return ctx.json(emptyListResponse);
				}

				userFilters = [{ field: "id", value: memberUserIds, operator: "in" }];
			}

			const users = await ctx.context.adapter.findMany<User>({
				model: "user",
				where: [...userFilters, ...apiFilters],
			});

			const membersByUserId = new Map<string, Member>();
			if (organizationId) {
				const members = await ctx.context.adapter.findMany<Member>({
					model: "member",
					where: [
						{ field: "organizationId", value: organizationId },
						{
							field: "userId",
							value: users.map((user) => user.id),
							operator: "in",
						},
					],
				});
				for (const member of members) {
					membersByUserId.set(member.userId, member);
				}
			}

			return ctx.json({
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				totalResults: users.length,
				startIndex: 1,
				itemsPerPage: users.length,
				Resources: users.map((user) => {
					const account = accounts.find((a) => a.userId === user.id);
					const member = membersByUserId.get(user.id);
					return createUserResource(
						ctx.context.baseURL,
						user,
						account,
						organizationId
							? groupMembershipFromRoles(
									ctx.context.baseURL,
									parseMemberRoles(member?.role ?? ""),
								)
							: undefined,
					);
				}),
			});
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
						"Returns virtual SCIM groups backed by organization roles.",
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
			const { members, users } = await findSCIMOrganizationMembers(ctx);
			const usersById = new Map(users.map((user) => [user.id, user]));
			let roles = Array.from(
				new Set(members.flatMap((member) => parseMemberRoles(member.role))),
			).sort((a, b) => a.localeCompare(b));

			if (ctx.query?.filter) {
				const { value } = parseSCIMAPIGroupFilter(ctx.query.filter);
				roles = roles.filter((role) => role.toLowerCase() === value);
			}

			const totalResults = roles.length;
			const startIndex = ctx.query?.startIndex ?? 1;
			const count = ctx.query?.count ?? totalResults;
			const paginatedRoles = roles.slice(
				startIndex - 1,
				startIndex - 1 + count,
			);

			const baseURL = ctx.context.baseURL;
			const Resources = paginatedRoles.map((role) => {
				const resolvedRoles = normalizeRoleSet(getGroupIdFromParam(role), {
					splitComma: true,
				});
				const groupMembers = getGroupMembers(
					resolvedRoles,
					members,
					usersById,
					baseURL,
				);
				return createGroupResource(baseURL, {
					id: serializeRoleSet(resolvedRoles),
					members: groupMembers,
				});
			});

			return ctx.json({
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				totalResults,
				startIndex,
				itemsPerPage: Resources.length,
				Resources,
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
					description:
						"Returns a virtual SCIM group backed by an organization role.",
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
			return ctx.json(await getGroupResource(ctx, ctx.params.groupId));
		},
	);

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
					summary: "Create SCIM group",
					description:
						"Creates a virtual SCIM group by applying mapped organization role(s) to SCIM users.",
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
			getOrganizationId(ctx);
			const roles = await resolveGroupRoles(opts, ctx.body);
			const groupId = serializeRoleSet(roles);

			const { members } = await findSCIMOrganizationMembers(ctx);
			if (members.some((member) => memberHasRoles(member, roles))) {
				throw new SCIMAPIError("CONFLICT", {
					detail: "Group already exists",
					scimType: "uniqueness",
				});
			}

			const users = await resolveSCIMGroupUsers(ctx, ctx.body.members);
			await addGroupRoles(ctx, roles, users);

			const groupResource = createGroupResource(ctx.context.baseURL, {
				id: groupId,
				externalId: ctx.body.externalId,
				displayName: ctx.body.displayName,
				members: users.map((user) =>
					userToMemberRef(user, ctx.context.baseURL),
				),
			});

			ctx.setStatus(201);
			ctx.setHeader("location", groupResource.meta.location);
			return ctx.json(groupResource);
		},
	);

export const updateSCIMGroup = (authMiddleware: AuthMiddleware) =>
	createAuthEndpoint(
		"/scim/v2/Groups/:groupId",
		{
			method: "PUT",
			body: APIGroupSchema,
			metadata: {
				...HIDE_METADATA,
				allowedMediaTypes: supportedMediaTypes,
				openapi: {
					summary: "Update SCIM group",
					description:
						"Replaces membership for a virtual SCIM group while preserving unrelated roles.",
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
			const roles = normalizeRoleSet(getGroupIdFromParam(ctx.params.groupId), {
				splitComma: true,
			});
			const users = await resolveSCIMGroupUsers(ctx, ctx.body.members);
			const nextUserIds = new Set(users.map((user) => user.id));

			await replaceGroupMembers(ctx, roles, nextUserIds);

			return ctx.json(await getGroupResource(ctx, ctx.params.groupId, true));
		},
	);

export const patchSCIMGroup = (authMiddleware: AuthMiddleware) =>
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
					description:
						"Adds, removes, or replaces members of a virtual SCIM group.",
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
			const roles = normalizeRoleSet(getGroupIdFromParam(ctx.params.groupId), {
				splitComma: true,
			});

			for (const operation of ctx.body.Operations) {
				const patchMembers = normalizePatchMembers(operation);
				if (!patchMembers) {
					continue;
				}

				const users = await resolveSCIMGroupUsers(ctx, patchMembers.members);
				const userIds = new Set(users.map((user) => user.id));

				if (operation.op === "replace") {
					await replaceGroupMembers(ctx, roles, userIds);
				} else if (operation.op === "add") {
					await addGroupRoles(ctx, roles, users);
				} else if (operation.op === "remove") {
					if (patchMembers.removeAll) {
						await replaceGroupMembers(ctx, roles, new Set());
					} else {
						await removeGroupRoles(ctx, roles, users);
					}
				}
			}

			return ctx.json(await getGroupResource(ctx, ctx.params.groupId, true));
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
					description:
						"Removes mapped organization role(s) from all members without deleting organization memberships.",
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
			const roles = normalizeRoleSet(getGroupIdFromParam(ctx.params.groupId), {
				splitComma: true,
			});
			const { members } = await findSCIMOrganizationMembers(ctx);

			await Promise.all(
				members
					.filter((member) => memberHasRoles(member, roles))
					.map((member) =>
						updateExistingMemberRoles(ctx, member, (currentMember) =>
							removeRolesFromMember(currentMember, roles),
						),
					),
			);

			ctx.setStatus(204);
			return;
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
			const providerId = ctx.context.scimProvider.providerId;
			const organizationId = ctx.context.scimProvider.organizationId;

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

			return ctx.json(
				createUserResource(
					ctx.context.baseURL,
					user,
					account,
					await getUserSCIMGroups(ctx, user.id),
				),
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

			const { user, account } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
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

			if (
				Object.keys(userPatch).length === 0 &&
				Object.keys(accountPatch).length === 0
			) {
				throw new SCIMAPIError("BAD_REQUEST", {
					detail: "No valid fields to update",
				});
			}

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

			const { user } = await findUserById(ctx.context.adapter, {
				userId,
				providerId,
				organizationId,
			});

			if (!user) {
				throw new SCIMAPIError("NOT_FOUND", {
					detail: "User not found",
				});
			}

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
	{
		userId,
		providerId,
		organizationId,
	}: { userId: string; providerId: string; organizationId?: string },
) => {
	const account = await adapter.findOne<Account>({
		model: "account",
		where: [
			{ field: "userId", value: userId },
			{ field: "providerId", value: providerId },
		],
	});

	// Disallows access to the resource
	// Account is not associated to the provider

	if (!account) {
		return { user: null, account: null };
	}

	let member: Member | null = null;
	if (organizationId) {
		member = await adapter.findOne<Member>({
			model: "member",
			where: [
				{ field: "organizationId", value: organizationId },
				{ field: "userId", value: userId },
			],
		});
	}

	// Disallows access to the resource
	// Token is restricted to an org and the member is not part of it

	if (organizationId && !member) {
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
	let filters: DBFilter[] = [];

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

const parseSCIMAPIGroupFilter = (filter: string) => {
	try {
		const parsedFilter = parseSCIMGroupFilter(filter);
		if (parsedFilter.operator !== "eq") {
			throw new SCIMParseError(
				`The operator "${parsedFilter.operator}" is not supported`,
			);
		}
		return parsedFilter;
	} catch (error) {
		throw new SCIMAPIError("BAD_REQUEST", {
			detail:
				error instanceof SCIMParseError ? error.message : "Invalid SCIM filter",
			scimType: "invalidFilter",
		});
	}
};
