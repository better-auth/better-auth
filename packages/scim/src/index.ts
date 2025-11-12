import {
	type Account,
	type BetterAuthPlugin,
	type DBAdapter,
	type User,
} from "better-auth";
import { createAuthEndpoint, type Member } from "better-auth/plugins";
import * as z from "zod/v4";
import { getAccountId, getUserFullName, getUserPrimaryEmail } from "./mappings";
import { authMiddleware } from "./middlewares";
import { buildUserPatch } from "./patch-operations";
import { SCIMAPIError } from "./scim-error";
import {
	type DBFilter,
	parseSCIMUserFilter,
	SCIMParseError,
} from "./scim-filters";
import { createUserResource } from "./scim-resources";
import {
	APIUserSchema,
	OpenAPIUserResourceSchema,
	SCIMUserResourceSchema,
	SCIMUserResourceType,
} from "./user-schemas";

const supportedSCIMSchemas = [SCIMUserResourceSchema];
const supportedSCIMResourceTypes = [SCIMUserResourceType];

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

export const scim = () => {
	return {
		id: "scim",
		endpoints: {
			createSCIMUser: createAuthEndpoint(
				"/scim/v2/Users",
				{
					method: "POST",
					body: APIUserSchema,
					metadata: {
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

					const [newUser, newAccount] = await ctx.context.adapter.transaction<
						[User, Account]
					>(async () => {
						const email = getUserPrimaryEmail(body.userName, body.emails);
						const name = getUserFullName(email, body.name);

						const user = await ctx.context.adapter.create<User>({
							model: "user",
							data: {
								email,
								name,
								emailVerified: true,
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						const account = await ctx.context.adapter.create<Account>({
							model: "account",
							data: {
								userId: user.id,
								providerId: providerId,
								accountId: accountId,
								createdAt: new Date(),
								updatedAt: new Date(),
								accessToken: "",
								refreshToken: "",
							},
						});

						const organizationId = ctx.context.scimProvider.organizationId;
						if (organizationId) {
							await ctx.context.adapter.create<Member>({
								model: "member",
								data: {
									userId: user.id,
									role: "member",
									createdAt: new Date(),
									organizationId,
								},
							});
						}

						return [user, account];
					});

					const userResource = createUserResource(
						ctx.context.baseURL,
						newUser,
						newAccount,
					);

					ctx.setStatus(201);

					return ctx.json(userResource, {
						headers: {
							location: userResource.meta.location,
						},
					});
				},
			),
			updateSCIMUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "PUT",
					body: APIUserSchema,
					metadata: {
						openapi: {
							summary: "Update SCIM user.",
							description:
								"Updates an existing user into the linked organization via SCIM. See https://datatracker.ietf.org/doc/html/rfc7644#section-3.3",
							responses: {
								"201": {
									description: "SCIM user resource",
									content: {
										"application/json": {
											schema: OpenAPIUserResourceSchema,
										},
									},
								},
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

					const [updatedUser, updatedAccount] =
						await ctx.context.adapter.transaction<
							[User | null, Account | null]
						>(async () => {
							const email = getUserPrimaryEmail(body.userName, body.emails);
							const name = getUserFullName(email, body.name);

							const updatedUser = await ctx.context.adapter.update<User>({
								model: "user",
								where: [{ field: "id", value: userId }],
								update: {
									email,
									name,
									updatedAt: new Date(),
								},
							});

							const updatedAccount = await ctx.context.adapter.update<Account>({
								model: "account",
								where: [
									{ field: "userId", value: userId },
									{ field: "providerId", value: providerId },
								],
								update: {
									accountId,
									updatedAt: new Date(),
								},
							});
							return [updatedUser, updatedAccount];
						});

					const userResource = createUserResource(
						ctx.context.baseURL,
						updatedUser!,
						updatedAccount,
					);

					return ctx.json(userResource);
				},
			),
			listSCIMUsers: createAuthEndpoint(
				"/scim/v2/Users",
				{
					method: "GET",
					query: z
						.object({
							filter: z.string().optional(),
						})
						.optional(),
					metadata: {
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
							},
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					let apiFilters: DBFilter[] = parseSCIMAPIUserFilter(
						ctx.query?.filter,
					);

					ctx.context.logger.info("Querying result with filters: ", apiFilters);

					const providerId = ctx.context.scimProvider.providerId;
					const accounts = await ctx.context.adapter.findMany<Account>({
						model: "account",
						where: [{ field: "providerId", value: providerId }],
					});

					const accountUserIds = accounts.map((account) => account.userId);
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
						userFilters = [
							{ field: "id", value: memberUserIds, operator: "in" },
						];
					}

					const users = await ctx.context.adapter.findMany<User>({
						model: "user",
						where: [...userFilters, ...apiFilters],
					});

					return ctx.json({
						schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
						totalResults: users.length,
						startIndex: 1,
						itemsPerPage: users.length,
						Resources: users.map((user) => {
							const account = accounts.find((a) => a.userId === user.id);
							return createUserResource(ctx.context.baseURL, user, account);
						}),
					});
				},
			),
			getSCIMUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "GET",
					metadata: {
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
						createUserResource(ctx.context.baseURL, user, account),
					);
				},
			),
			patchSCIMUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "PATCH",
					body: z.object({
						schemas: z
							.array(z.string())
							.refine(
								(s) =>
									s.includes("urn:ietf:params:scim:api:messages:2.0:PatchOp"),
								{
									message: "Invalid schemas for PatchOp",
								},
							),
						Operations: z.array(
							z.object({
								op: z.enum(["replace", "add", "remove"]).default("replace"),
								path: z.string().optional(),
								value: z.any(),
							}),
						),
					}),
					metadata: {
						openapi: {
							summary: "Patch SCIM user",
							description: "Updates fields on a SCIM user record",
						},
					},
					use: [authMiddleware],
				},
				async (ctx) => {
					const userId = ctx.params.userId;
					const organizationId = ctx.context.scimProvider.organizationId;
					const providerId = ctx.context.scimProvider.providerId;

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
							? ctx.context.adapter.update<User>({
									model: "user",
									where: [{ field: "id", value: userId }],
									update: { ...userPatch, updatedAt: new Date() },
								})
							: Promise.resolve(),
						Object.keys(accountPatch).length > 0
							? ctx.context.adapter.update<Account>({
									model: "account",
									where: [
										{ field: "userId", value: userId },
										{ field: "providerId", value: providerId },
									],
									update: {
										...accountPatch,
										updatedAt: new Date(),
									},
								})
							: Promise.resolve(),
					]);

					ctx.setStatus(204);
					return;
				},
			),
			deleteSCIMUser: createAuthEndpoint(
				"/scim/v2/Users/:userId",
				{
					method: "DELETE",
					metadata: {
						openapi: {
							summary: "Delete SCIM user",
							description:
								"Deletes (or deactivates) a user within the linked organization.",
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

					await ctx.context.adapter.delete({
						model: "user",
						where: [{ field: "id", value: userId }],
					});

					ctx.setStatus(204);
					return;
				},
			),
			getSCIMServiceProviderConfig: createAuthEndpoint(
				"/scim/v2/ServiceProviderConfig",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Configuration",
							description:
								"Standard SCIM metadata endpoint used by identity providers. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
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
						schemas: [
							"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig",
						],
						meta: {
							resourceType: "ServiceProviderConfig",
						},
					});
				},
			),
			getSCIMSchemas: createAuthEndpoint(
				"/scim/v2/Schemas",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Configuration Schemas",
							description:
								"Standard SCIM metadata endpoint used by identity providers to acquire information about supported schemas. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
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
									location: new URL(
										s.meta.location,
										ctx.context.baseURL,
									).toString(),
								},
							};
						}),
					});
				},
			),
			getSCIMSchema: createAuthEndpoint(
				"/scim/v2/Schemas/:schemaId",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM a Service Provider Configuration Schema",
							description:
								"Standard SCIM metadata endpoint used by identity providers to acquire information about a given schema. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
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
							location: new URL(schema.meta.location, ctx.context.baseURL),
						},
					});
				},
			),
			getSCIMResourceTypes: createAuthEndpoint(
				"/scim/v2/ResourceTypes",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Suppoted Resource Types",
							description:
								"Standard SCIM metadata endpoint used by identity providers to get a list of server supported types. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
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
									location: new URL(
										s.meta.location,
										ctx.context.baseURL,
									).toString(),
								},
							};
						}),
					});
				},
			),
			getSCIMResourceType: createAuthEndpoint(
				"/scim/v2/ResourceTypes/:resourceTypeId",
				{
					method: "GET",
					metadata: {
						openapi: {
							summary: "SCIM Service Provider Supported Resource Type",
							description:
								"Standard SCIM metadata endpoint used by identity providers to get a server supported type. See https://datatracker.ietf.org/doc/html/rfc7644#section-4",
							responses: {
								"200": {
									description: "SCIM metadata object",
								},
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
							location: new URL(
								resourceType.meta.location,
								ctx.context.baseURL,
							),
						},
					});
				},
			),
		},
		schema: {
			scimProvider: {
				fields: {
					providerId: {
						type: "string",
						required: true,
						unique: true,
					},
					scimToken: {
						type: "string",
						required: true,
						unique: true,
					},
					organizationId: {
						type: "string",
						required: false,
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;
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
