import type { AuthContext, DBAdapter, User, Where } from "better-auth";
import { HIDE_METADATA } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import type {
	SCIMAttributeProjection,
	SCIMCollectionQueryInput,
	SCIMEqualityFilter,
	SCIMUserFilterAttribute,
} from "./collection-query";
import {
	parseSCIMAttributeProjection,
	parseSCIMCollectionQuery,
	scimAttributeProjectionQuerySchema,
	scimCollectionQuerySchema,
} from "./collection-query";
import type { SCIMConnection } from "./configuration";
import type { SCIMConnectionMiddleware } from "./connection-authentication";
import { fenceActiveSCIMConnection } from "./connection-state";
import {
	acquireSCIMGroupMutationLocks,
	markSCIMGroupsModified,
	runGroupMutationTransaction,
	throwConcurrentSCIMGroupMutation,
} from "./group-state";
import type { SCIMIdentityCoordinator } from "./identity";
import { runIdentityMutationTransaction } from "./identity";
import type {
	SCIMGroup,
	SCIMGroupMember,
	SCIMSubject,
	SCIMUser,
} from "./persistence";
import type { SCIMProjectionCoordinator } from "./projection";
import { projectSCIMResourceAttributes } from "./resource-attribute-projection";
import {
	createSCIMOrderKey,
	createSCIMUserExternalIdKey,
	createScopedKey,
} from "./resource-key";
import { SCIM_RESOURCE_SCHEMA_REGISTRY } from "./resource-schema-registry";
import { runSCIMCreateWithUniquenessCheck } from "./resource-uniqueness";
import { createSCIMError, SCIMErrorOpenAPISchemas } from "./scim-error";
import {
	createSCIMOpenAPIContent,
	defineSCIMEndpointMetadata,
	getResourceURL,
	SCIM_REQUEST_MEDIA_TYPES,
} from "./scim-metadata";
import {
	applySCIMUserPatch,
	patchSCIMUserBodySchema,
	scimUserPatchChangesState,
} from "./user-patch";
import {
	createCanonicalSCIMUserProfile,
	createSCIMEmailValueIndex,
	createSCIMEmailValueToken,
	readSCIMEmails,
	serializeSCIMEmails,
} from "./user-profile";

const {
	inputSchema: APIUserSchema,
	openAPISchema: OpenAPIUserResourceSchema,
	schemaId: SCIM_USER_SCHEMA,
} = SCIM_RESOURCE_SCHEMA_REGISTRY.User;

function requireUserAttributeProjection(
	input: SCIMCollectionQueryInput,
): SCIMAttributeProjection {
	const projection = parseSCIMAttributeProjection("User", input);
	if (!projection.ok) {
		throw createSCIMError("BAD_REQUEST", {
			detail: projection.error.detail,
			scimType: projection.error.scimType,
		});
	}
	return projection.value;
}

function requestsProjectedMutationResponse(
	input: SCIMCollectionQueryInput,
): boolean {
	return (
		input.attributes !== undefined || input.excludedAttributes !== undefined
	);
}

function createUserNameKey(connectionId: string, userName: string): string {
	return createScopedKey(["scim-user-name", connectionId, userName]);
}

function createExternalIdKey(
	connectionId: string,
	externalId?: string,
): string | undefined {
	if (!externalId) return undefined;
	return createSCIMUserExternalIdKey(connectionId, externalId);
}

function createConnectionUserKey(connectionId: string, userId: string): string {
	return createScopedKey(["scim-user", connectionId, userId]);
}

function areMembershipGroupsLocked(
	memberships: readonly SCIMGroupMember[],
	lockedGroups: readonly SCIMGroup[],
): boolean {
	const membershipGroupIds = new Set(
		memberships.map((membership) => membership.groupId),
	);
	return (
		membershipGroupIds.size === lockedGroups.length &&
		lockedGroups.every((group) => membershipGroupIds.has(group.id))
	);
}

function createUserCollectionWhere(
	connectionId: string,
	filters: readonly SCIMEqualityFilter<SCIMUserFilterAttribute>[],
): Where[] {
	const where: Where[] = [{ field: "connectionId", value: connectionId }];
	for (const filter of filters) {
		switch (filter.attribute) {
			case "id":
				where.push({ field: "id", value: filter.value });
				break;
			case "userName":
				where.push({
					field: "userNameKey",
					value: createUserNameKey(connectionId, filter.value.toLowerCase()),
				});
				break;
			case "externalId":
				where.push({
					field: "externalIdKey",
					value: createExternalIdKey(connectionId, filter.value) ?? "",
				});
				break;
			case "emails.value":
				where.push({
					field: "emailValueIndex",
					value: `|${createSCIMEmailValueToken(filter.value)}|`,
					operator: "contains",
				});
				break;
			case "emails.work.value":
				where.push({
					field: "workEmailValueIndex",
					value: `|${createSCIMEmailValueToken(filter.value)}|`,
					operator: "contains",
				});
				break;
		}
	}

	return where;
}

function createUserResource(baseURL: string, scimUser: SCIMUser) {
	return {
		schemas: [SCIM_USER_SCHEMA],
		id: scimUser.id,
		...(scimUser.externalId ? { externalId: scimUser.externalId } : {}),
		userName: scimUser.userName,
		name: {
			formatted: scimUser.formattedName,
			...(scimUser.givenName ? { givenName: scimUser.givenName } : {}),
			...(scimUser.familyName ? { familyName: scimUser.familyName } : {}),
		},
		displayName: scimUser.displayName,
		active: scimUser.active,
		emails: readSCIMEmails(scimUser),
		meta: {
			resourceType: "User",
			created: scimUser.createdAt,
			lastModified: scimUser.updatedAt,
			location: getResourceURL(
				`/scim/v2/Users/${encodeURIComponent(scimUser.id)}`,
				baseURL,
			),
		},
	};
}

async function findSCIMUser(
	adapter: Pick<DBAdapter, "findOne">,
	connection: SCIMConnection,
	scimUserId: string,
) {
	const scimUser = await adapter.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "id", value: scimUserId },
			{ field: "connectionId", value: connection.id },
		],
	});
	if (
		scimUser &&
		scimUser.provisioningDomainId !== connection.provisioningDomainId
	) {
		throw createSCIMError("CONFLICT", {
			detail:
				"The connection provisioningDomainId changed after resources were created",
		});
	}
	return scimUser;
}

async function requireSCIMSubject(
	adapter: Pick<DBAdapter, "findOne">,
	userId: string,
): Promise<SCIMSubject> {
	const subject = await adapter.findOne<SCIMSubject>({
		model: "scimSubject",
		where: [{ field: "userId", value: userId }],
	});
	if (!subject) {
		throw createSCIMError("INTERNAL_SERVER_ERROR", {
			detail: "The SCIM User subject is missing",
		});
	}
	return subject;
}

async function assertConnectionUserAvailable(
	adapter: Pick<DBAdapter, "findOne">,
	connectionId: string,
	userId: string,
): Promise<void> {
	const existing = await adapter.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: connectionId },
			{
				field: "connectionUserKey",
				value: createConnectionUserKey(connectionId, userId),
			},
		],
	});
	if (existing) {
		throw createSCIMError("CONFLICT", {
			detail:
				"This connection already provisions the resolved Better Auth User",
			scimType: "uniqueness",
		});
	}
}

async function assertUserConnectionDomainStable(
	adapter: Pick<DBAdapter, "findOne">,
	connection: SCIMConnection,
): Promise<void> {
	const mismatched = await adapter.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: connection.id },
			{
				field: "provisioningDomainId",
				value: connection.provisioningDomainId,
				operator: "ne",
			},
		],
	});
	if (mismatched) {
		throw createSCIMError("CONFLICT", {
			detail:
				"The connection provisioningDomainId changed after resources were created",
		});
	}
}

async function assertSCIMUserKeysAvailable(
	adapter: Pick<DBAdapter, "findOne">,
	input: {
		connectionId: string;
		userNameKey: string;
		externalIdKey?: string;
		excludeSCIMUserId?: string;
	},
): Promise<void> {
	const existingUserName = await adapter.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: input.connectionId },
			{ field: "userNameKey", value: input.userNameKey },
		],
	});
	if (existingUserName && existingUserName.id !== input.excludeSCIMUserId) {
		throw createSCIMError("CONFLICT", {
			detail: "SCIM User userName already exists",
			scimType: "uniqueness",
		});
	}

	if (!input.externalIdKey) return;
	const existingExternalId = await adapter.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: input.connectionId },
			{ field: "externalIdKey", value: input.externalIdKey },
		],
	});
	if (existingExternalId && existingExternalId.id !== input.excludeSCIMUserId) {
		throw createSCIMError("CONFLICT", {
			detail: "SCIM User externalId already exists",
			scimType: "uniqueness",
		});
	}
}

async function assertBetterAuthEmailAvailable(
	adapter: Pick<DBAdapter, "findOne">,
	email: string,
	excludeUserId?: string,
): Promise<void> {
	const existingUser = await adapter.findOne<User>({
		model: "user",
		where: [{ field: "email", value: email }],
	});
	if (existingUser && existingUser.id !== excludeUserId) {
		throw createSCIMError("CONFLICT", {
			detail: "A Better Auth User already uses this email",
			scimType: "uniqueness",
		});
	}
}

async function updateManagedBetterAuthUser(
	adapter: Pick<DBAdapter, "findOne">,
	internalAdapter: AuthContext["internalAdapter"],
	input: {
		userId: string;
		email: string;
		name: string;
		updatedAt: Date;
	},
): Promise<User> {
	const user = await adapter.findOne<User>({
		model: "user",
		where: [{ field: "id", value: input.userId }],
	});
	if (!user) {
		throw createSCIMError("CONFLICT", {
			detail: "The linked Better Auth User no longer exists",
		});
	}
	await assertBetterAuthEmailAvailable(adapter, input.email, user.id);
	const updatedUser = await internalAdapter.updateUser(user.id, {
		email: input.email,
		name: input.name,
		...(user.email !== input.email ? { emailVerified: false } : {}),
		updatedAt: input.updatedAt,
	});
	if (!updatedUser) {
		throw createSCIMError("CONFLICT", {
			detail: "The linked Better Auth User no longer exists",
		});
	}
	return updatedUser;
}

export function createSCIMUser(
	authMiddleware: SCIMConnectionMiddleware,
	identity: SCIMIdentityCoordinator,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Users",
		{
			method: "POST",
			body: APIUserSchema,
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Create SCIM User",
					responses: {
						"201": {
							description: "SCIM User resource",
							content: createSCIMOpenAPIContent(OpenAPIUserResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const connection = ctx.context.scimConnection;
			const attributeProjection = requireUserAttributeProjection(
				ctx.query ?? {},
			);
			const profile = createCanonicalSCIMUserProfile(ctx.body);
			const active = ctx.body.active !== false;
			const userNameKey = createUserNameKey(
				connection.id,
				profile.userName.toLowerCase(),
			);
			const externalIdKey = createExternalIdKey(
				connection.id,
				ctx.body.externalId,
			);
			await assertUserConnectionDomainStable(adapter, connection);
			await assertSCIMUserKeysAvailable(adapter, {
				connectionId: connection.id,
				userNameKey,
				externalIdKey,
			});
			const resolvedIdentity = await identity.resolveUser(
				{
					connectionId: connection.id,
					provisioningDomainId: connection.provisioningDomainId,
					resource: {
						...(ctx.body.externalId ? { externalId: ctx.body.externalId } : {}),
						userName: profile.userName,
						primaryEmail: profile.primaryEmail,
						displayName: profile.displayName,
						name: {
							formatted: profile.formattedName,
							...(profile.givenName ? { givenName: profile.givenName } : {}),
							...(profile.familyName ? { familyName: profile.familyName } : {}),
						},
						emails: profile.emails,
						active,
					},
				},
				{ database: adapter },
			);
			const { resolution } = resolvedIdentity;

			const scimUser = await runSCIMCreateWithUniquenessCheck(
				() =>
					runIdentityMutationTransaction(
						adapter,
						async (trx) => {
							await assertSCIMUserKeysAvailable(trx, {
								connectionId: connection.id,
								userNameKey,
								externalIdKey,
							});

							let user: User;
							if (resolution.action === "create") {
								await assertBetterAuthEmailAvailable(trx, profile.primaryEmail);
								user = await ctx.context.internalAdapter.createUser(
									{ email: profile.primaryEmail, name: profile.displayName },
									{ method: "scim", connectionId: connection.id },
								);
							} else {
								const linkedUser = await trx.findOne<User>({
									model: "user",
									where: [{ field: "id", value: resolution.userId }],
								});
								if (!linkedUser) {
									throw createSCIMError("CONFLICT", {
										detail: "The resolved Better Auth User does not exist",
									});
								}
								user = linkedUser;
							}

							await assertConnectionUserAvailable(trx, connection.id, user.id);
							const now = new Date();
							let subject = await identity.acquireSubject(trx, user.id, now);
							const createdSCIMUser = await trx.create<
								Omit<SCIMUser, "id">,
								SCIMUser
							>({
								model: "scimUser",
								data: {
									connectionId: connection.id,
									provisioningDomainId: connection.provisioningDomainId,
									userId: user.id,
									connectionUserKey: createConnectionUserKey(
										connection.id,
										user.id,
									),
									userName: profile.userName,
									userNameKey,
									primaryEmail: profile.primaryEmail,
									workEmailValueIndex: createSCIMEmailValueIndex(
										profile.emails,
										"work",
									),
									emailValueIndex: createSCIMEmailValueIndex(profile.emails),
									displayName: profile.displayName,
									formattedName: profile.formattedName,
									givenName: profile.givenName,
									familyName: profile.familyName,
									serializedEmails: serializeSCIMEmails(profile.emails),
									externalId: ctx.body.externalId,
									externalIdKey,
									active,
									orderKey: createSCIMOrderKey(now),
									createdAt: now,
									updatedAt: now,
								},
							});

							const managesProfile =
								resolution.action === "create" ||
								resolution.profile === "manage";
							if (managesProfile) {
								subject = await identity.claimProfileSource(
									trx,
									subject,
									createdSCIMUser.id,
									now,
								);
								if (resolution.action === "link") {
									await updateManagedBetterAuthUser(
										trx,
										ctx.context.internalAdapter,
										{
											userId: user.id,
											email: profile.primaryEmail,
											name: profile.displayName,
											updatedAt: now,
										},
									);
								}
							}
							await identity.consumeTombstone(
								trx,
								resolvedIdentity.tombstoneId,
							);

							await projection.reconcileUser({
								database: trx,
								auth: ctx.context,
								provisioningDomainId: connection.provisioningDomainId,
								scimUserId: createdSCIMUser.id,
							});
							await identity.reconcileUser({
								database: trx,
								auth: ctx.context,
								subject,
							});
							await fenceActiveSCIMConnection(trx, connection.id);
							return createdSCIMUser;
						},
						resolution.action === "link"
							? { subjectCreationUserId: resolution.userId }
							: undefined,
					),
				async () => {
					await assertSCIMUserKeysAvailable(adapter, {
						connectionId: connection.id,
						userNameKey,
						externalIdKey,
					});
					if (resolution.action === "create") {
						await assertBetterAuthEmailAvailable(adapter, profile.primaryEmail);
						return;
					}
					await assertConnectionUserAvailable(
						adapter,
						connection.id,
						resolution.userId,
					);
				},
			);

			const completeResource = createUserResource(
				ctx.context.baseURL,
				scimUser,
			);
			const resource = projectSCIMResourceAttributes(
				completeResource,
				attributeProjection,
			);
			ctx.setStatus(201);
			ctx.setHeader("location", completeResource.meta.location);
			ctx.setHeader("content-location", completeResource.meta.location);
			return ctx.json(resource);
		},
	);
}

export function getSCIMUser(authMiddleware: SCIMConnectionMiddleware) {
	return createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "GET",
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Get SCIM User",
					responses: {
						"200": {
							description: "SCIM User resource",
							content: createSCIMOpenAPIContent(OpenAPIUserResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const scimUser = await findSCIMUser(
				adapter,
				ctx.context.scimConnection,
				ctx.params.userId,
			);
			if (!scimUser) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM User not found",
				});
			}

			const attributeProjection = requireUserAttributeProjection(
				ctx.query ?? {},
			);

			return ctx.json(
				projectSCIMResourceAttributes(
					createUserResource(ctx.context.baseURL, scimUser),
					attributeProjection,
				),
			);
		},
	);
}

export function listSCIMUsers(authMiddleware: SCIMConnectionMiddleware) {
	return createAuthEndpoint(
		"/scim/v2/Users",
		{
			method: "GET",
			query: scimCollectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "List SCIM Users",
					responses: {
						"200": {
							description: "SCIM User list",
							content: createSCIMOpenAPIContent({
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
							}),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			await assertUserConnectionDomainStable(
				adapter,
				ctx.context.scimConnection,
			);
			const parsedQuery = parseSCIMCollectionQuery("User", ctx.query ?? {});
			if (!parsedQuery.ok) {
				throw createSCIMError("BAD_REQUEST", {
					detail: parsedQuery.error.detail,
					scimType: parsedQuery.error.scimType,
				});
			}
			const {
				filters,
				pagination,
				projection: attributeProjection,
			} = parsedQuery.value;
			const where = createUserCollectionWhere(
				ctx.context.scimConnection.id,
				filters,
			);
			const totalResults = await adapter.count({
				model: "scimUser",
				where,
			});
			const scimUsers =
				pagination.count === 0
					? []
					: await adapter.findMany<SCIMUser>({
							model: "scimUser",
							where,
							limit: pagination.count,
							offset: pagination.offset,
							sortBy: { field: "orderKey", direction: "asc" },
						});

			const resources = scimUsers.map((scimUser) =>
				projectSCIMResourceAttributes(
					createUserResource(ctx.context.baseURL, scimUser),
					attributeProjection,
				),
			);

			return ctx.json({
				schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
				totalResults,
				startIndex: pagination.startIndex,
				itemsPerPage: resources.length,
				Resources: resources,
			});
		},
	);
}

export function replaceSCIMUser(
	authMiddleware: SCIMConnectionMiddleware,
	identity: SCIMIdentityCoordinator,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "PUT",
			body: APIUserSchema,
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Replace SCIM User",
					responses: {
						"200": {
							description: "SCIM User resource",
							content: createSCIMOpenAPIContent(OpenAPIUserResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const connection = ctx.context.scimConnection;
			const attributeProjection = requireUserAttributeProjection(
				ctx.query ?? {},
			);
			const scimUser = await findSCIMUser(
				adapter,
				connection,
				ctx.params.userId,
			);
			if (!scimUser) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM User not found",
				});
			}

			const profile = createCanonicalSCIMUserProfile(ctx.body);
			const userNameKey = createUserNameKey(
				connection.id,
				profile.userName.toLowerCase(),
			);
			const externalIdKey = createExternalIdKey(
				connection.id,
				ctx.body.externalId,
			);
			await assertSCIMUserKeysAvailable(adapter, {
				connectionId: connection.id,
				userNameKey,
				externalIdKey,
				excludeSCIMUserId: scimUser.id,
			});

			const active = ctx.body.active !== false;
			const updatedSCIMUser = await runIdentityMutationTransaction(
				adapter,
				async (trx) => {
					const currentSource = await findSCIMUser(
						trx,
						connection,
						scimUser.id,
					);
					if (!currentSource) {
						throw createSCIMError("NOT_FOUND", {
							detail: "SCIM User not found",
						});
					}
					const updatedAt = new Date();
					const subject = await identity.acquireSubject(
						trx,
						currentSource.userId,
						updatedAt,
					);
					await assertSCIMUserKeysAvailable(trx, {
						connectionId: connection.id,
						userNameKey,
						externalIdKey,
						excludeSCIMUserId: currentSource.id,
					});
					if (subject.profileSourceId === currentSource.id) {
						await updateManagedBetterAuthUser(
							trx,
							ctx.context.internalAdapter,
							{
								userId: currentSource.userId,
								email: profile.primaryEmail,
								name: profile.displayName,
								updatedAt,
							},
						);
					}

					const updatedSource = await trx.update<SCIMUser>({
						model: "scimUser",
						where: [
							{ field: "id", value: currentSource.id },
							{ field: "connectionId", value: connection.id },
						],
						update: {
							userName: profile.userName,
							userNameKey,
							primaryEmail: profile.primaryEmail,
							workEmailValueIndex: createSCIMEmailValueIndex(
								profile.emails,
								"work",
							),
							emailValueIndex: createSCIMEmailValueIndex(profile.emails),
							displayName: profile.displayName,
							formattedName: profile.formattedName,
							givenName: profile.givenName ?? null,
							familyName: profile.familyName ?? null,
							serializedEmails: serializeSCIMEmails(profile.emails),
							externalId: ctx.body.externalId ?? null,
							externalIdKey: externalIdKey ?? null,
							active,
							updatedAt,
						},
					});
					if (!updatedSource) {
						throw createSCIMError("NOT_FOUND", {
							detail: "SCIM User not found",
						});
					}
					await projection.reconcileUser({
						database: trx,
						auth: ctx.context,
						provisioningDomainId: connection.provisioningDomainId,
						scimUserId: updatedSource.id,
					});
					await identity.reconcileUser({
						database: trx,
						auth: ctx.context,
						subject,
					});
					await fenceActiveSCIMConnection(trx, connection.id);
					return updatedSource;
				},
			);

			const completeResource = createUserResource(
				ctx.context.baseURL,
				updatedSCIMUser,
			);
			ctx.setHeader("location", completeResource.meta.location);
			return ctx.json(
				projectSCIMResourceAttributes(completeResource, attributeProjection),
			);
		},
	);
}

export function patchSCIMUser(
	authMiddleware: SCIMConnectionMiddleware,
	identity: SCIMIdentityCoordinator,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "PATCH",
			body: patchSCIMUserBodySchema,
			query: scimAttributeProjectionQuerySchema.optional(),
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Patch SCIM User",
					responses: {
						"204": {
							description: "SCIM User updated",
						},
						"200": {
							description: "Projected SCIM User resource",
							content: createSCIMOpenAPIContent(OpenAPIUserResourceSchema),
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const query = ctx.query ?? {};
			const attributeProjection = requireUserAttributeProjection(query);
			const returnResource = requestsProjectedMutationResponse(query);
			const scimUser = await findSCIMUser(
				adapter,
				ctx.context.scimConnection,
				ctx.params.userId,
			);
			if (!scimUser) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM User not found",
				});
			}

			const connection = ctx.context.scimConnection;
			const updatedSCIMUser = await runIdentityMutationTransaction(
				adapter,
				async (trx) => {
					const sourceBeforeLock = await findSCIMUser(
						trx,
						connection,
						scimUser.id,
					);
					if (!sourceBeforeLock) {
						throw createSCIMError("NOT_FOUND", {
							detail: "SCIM User not found",
						});
					}
					const subjectBeforeLock = await requireSCIMSubject(
						trx,
						sourceBeforeLock.userId,
					);
					const updatedAt = new Date();
					const subject = await identity.acquireSubjectRevision(
						trx,
						subjectBeforeLock,
						updatedAt,
					);
					const currentSource = await findSCIMUser(
						trx,
						connection,
						sourceBeforeLock.id,
					);
					if (!currentSource) {
						throw createSCIMError("NOT_FOUND", {
							detail: "SCIM User not found",
						});
					}
					if (currentSource.userId !== sourceBeforeLock.userId) {
						throw createSCIMError("CONFLICT", {
							detail: "The SCIM User identity changed concurrently",
						});
					}
					const patch = applySCIMUserPatch(currentSource, ctx.body.Operations);
					if (!scimUserPatchChangesState(currentSource, patch)) {
						await fenceActiveSCIMConnection(trx, connection.id);
						return currentSource;
					}
					const userNameKey = createUserNameKey(
						connection.id,
						patch.userName.toLowerCase(),
					);
					const externalIdKey = createExternalIdKey(
						connection.id,
						patch.externalId,
					);
					await assertSCIMUserKeysAvailable(trx, {
						connectionId: connection.id,
						userNameKey,
						externalIdKey,
						excludeSCIMUserId: currentSource.id,
					});
					if (subject.profileSourceId === currentSource.id) {
						await updateManagedBetterAuthUser(
							trx,
							ctx.context.internalAdapter,
							{
								userId: currentSource.userId,
								email: patch.primaryEmail,
								name: patch.displayName,
								updatedAt,
							},
						);
					}
					const updatedSCIMUser = await trx.update<SCIMUser>({
						model: "scimUser",
						where: [
							{ field: "id", value: currentSource.id },
							{ field: "connectionId", value: connection.id },
						],
						update: {
							userName: patch.userName,
							userNameKey,
							primaryEmail: patch.primaryEmail,
							workEmailValueIndex: createSCIMEmailValueIndex(
								patch.emails,
								"work",
							),
							emailValueIndex: createSCIMEmailValueIndex(patch.emails),
							displayName: patch.displayName,
							formattedName: patch.formattedName,
							givenName: patch.givenName ?? null,
							familyName: patch.familyName ?? null,
							serializedEmails: serializeSCIMEmails(patch.emails),
							externalId: patch.externalId ?? null,
							externalIdKey: externalIdKey ?? null,
							active: patch.active,
							updatedAt,
						},
					});
					if (!updatedSCIMUser) {
						throw createSCIMError("NOT_FOUND", {
							detail: "SCIM User not found",
						});
					}
					await projection.reconcileUser({
						database: trx,
						auth: ctx.context,
						provisioningDomainId: connection.provisioningDomainId,
						scimUserId: updatedSCIMUser.id,
					});
					await identity.reconcileUser({
						database: trx,
						auth: ctx.context,
						subject,
					});
					await fenceActiveSCIMConnection(trx, connection.id);
					return updatedSCIMUser;
				},
			);

			const completeResource = createUserResource(
				ctx.context.baseURL,
				updatedSCIMUser,
			);
			ctx.setHeader("location", completeResource.meta.location);
			if (returnResource) {
				return ctx.json(
					projectSCIMResourceAttributes(completeResource, attributeProjection),
				);
			}
			ctx.setStatus(204);
			return;
		},
	);
}

export function deleteSCIMUser(
	authMiddleware: SCIMConnectionMiddleware,
	identity: SCIMIdentityCoordinator,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint(
		"/scim/v2/Users/:userId",
		{
			method: "DELETE",
			metadata: defineSCIMEndpointMetadata({
				...HIDE_METADATA,
				allowedMediaTypes: SCIM_REQUEST_MEDIA_TYPES,
				openapi: {
					summary: "Delete SCIM User",
					responses: {
						"204": {
							description: "SCIM User deleted",
						},
						...SCIMErrorOpenAPISchemas,
					},
				},
			}),
			use: [authMiddleware],
		},
		async (ctx) => {
			const adapter: DBAdapter = ctx.context.adapter;
			const scimUser = await findSCIMUser(
				adapter,
				ctx.context.scimConnection,
				ctx.params.userId,
			);
			if (!scimUser) {
				throw createSCIMError("NOT_FOUND", {
					detail: "SCIM User not found",
				});
			}

			await runGroupMutationTransaction(adapter, async (trx) => {
				const sourceBeforeLocks = await findSCIMUser(
					trx,
					ctx.context.scimConnection,
					scimUser.id,
				);
				if (!sourceBeforeLocks) {
					throw createSCIMError("NOT_FOUND", {
						detail: "SCIM User not found",
					});
				}
				const subjectBeforeLocks = await requireSCIMSubject(
					trx,
					sourceBeforeLocks.userId,
				);
				const memberships = await trx.findMany<SCIMGroupMember>({
					model: "scimGroupMember",
					where: [
						{
							field: "connectionId",
							value: ctx.context.scimConnection.id,
						},
						{ field: "scimUserId", value: sourceBeforeLocks.id },
					],
				});
				const lockedGroups = await acquireSCIMGroupMutationLocks(
					trx,
					ctx.context.scimConnection,
					memberships.map((membership) => membership.groupId),
				);
				const now = new Date();
				let subject = await identity.acquireSubjectRevision(
					trx,
					subjectBeforeLocks,
					now,
				);
				const currentSource = await findSCIMUser(
					trx,
					ctx.context.scimConnection,
					sourceBeforeLocks.id,
				);
				if (!currentSource) {
					throw createSCIMError("NOT_FOUND", {
						detail: "SCIM User not found",
					});
				}
				if (currentSource.userId !== sourceBeforeLocks.userId) {
					throw createSCIMError("CONFLICT", {
						detail: "The SCIM User identity changed concurrently",
					});
				}
				const lockedMemberships = await trx.findMany<SCIMGroupMember>({
					model: "scimGroupMember",
					where: [
						{
							field: "connectionId",
							value: ctx.context.scimConnection.id,
						},
						{ field: "scimUserId", value: currentSource.id },
					],
				});
				if (!areMembershipGroupsLocked(lockedMemberships, lockedGroups)) {
					throwConcurrentSCIMGroupMutation();
				}
				await identity.preserveDeletedSource(trx, {
					source: currentSource,
					subject,
					deletedAt: now,
				});
				await trx.deleteMany({
					model: "scimGroupMember",
					where: [
						{
							field: "connectionId",
							value: ctx.context.scimConnection.id,
						},
						{ field: "scimUserId", value: currentSource.id },
					],
				});
				await markSCIMGroupsModified(
					trx,
					ctx.context.scimConnection.id,
					lockedGroups,
					now,
				);
				await trx.deleteMany({
					model: "scimProjectionGrant",
					where: [{ field: "scimUserId", value: currentSource.id }],
				});
				await trx.delete<SCIMUser>({
					model: "scimUser",
					where: [
						{ field: "id", value: currentSource.id },
						{
							field: "connectionId",
							value: ctx.context.scimConnection.id,
						},
					],
				});
				subject = await identity.clearProfileSource(
					trx,
					subject,
					currentSource.id,
					now,
				);
				await projection.reconcileUser({
					database: trx,
					auth: ctx.context,
					provisioningDomainId: currentSource.provisioningDomainId,
					scimUserId: currentSource.id,
					userId: currentSource.userId,
				});
				await identity.reconcileUser({
					database: trx,
					auth: ctx.context,
					subject,
				});
				await fenceActiveSCIMConnection(trx, ctx.context.scimConnection.id);
			});

			ctx.setStatus(204);
			return;
		},
	);
}
